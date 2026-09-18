import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";
import { processDocumentJob } from "@/lib/documents/process";
import { runResearchCampaign } from "@/lib/research/campaign";

/**
 * Durable job drain for cold deploys where `after()` may drop work.
 * Safe to call from Vercel Cron / QStash / manual worker.
 */
export async function processQueuedJobs(limit = 5) {
  const staleBefore = new Date(Date.now() - 1000 * 60 * 15);

  // Re-queue stuck running jobs
  await db
    .update(jobs)
    .set({ status: "queued", errorMessage: "Requeued after stale running state" })
    .where(
      and(
        eq(jobs.status, "running"),
        lt(jobs.startedAt, staleBefore),
        sql`coalesce(${jobs.attempts}, 0) < 5`,
      ),
    );

  const queued = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.status, "queued"),
        inArray(jobs.type, ["document.process", "research.campaign"]),
      ),
    )
    .orderBy(asc(jobs.createdAt))
    .limit(limit);

  const results: Array<{ id: string; type: string; ok: boolean; error?: string }> = [];

  for (const job of queued) {
    try {
      if (job.type === "document.process") {
        await processDocumentJob(job.id);
        results.push({ id: job.id, type: job.type, ok: true });
      } else if (job.type === "research.campaign") {
        const campaignId = String(job.payload?.campaignId ?? "");
        if (!campaignId) throw new Error("Job missing campaignId");

        // Skip if after() already finished the campaign
        const { researchCampaigns } = await import("@/lib/db/schema");
        const [campaign] = await db
          .select()
          .from(researchCampaigns)
          .where(eq(researchCampaigns.id, campaignId))
          .limit(1);
        if (campaign?.status === "completed") {
          await db
            .update(jobs)
            .set({ status: "completed", finishedAt: new Date(), result: { skipped: true } })
            .where(eq(jobs.id, job.id));
          results.push({ id: job.id, type: job.type, ok: true });
          continue;
        }
        if (campaign?.status === "running") {
          results.push({ id: job.id, type: job.type, ok: true });
          continue;
        }

        await db
          .update(jobs)
          .set({
            status: "running",
            startedAt: new Date(),
            attempts: (job.attempts ?? 0) + 1,
          })
          .where(eq(jobs.id, job.id));

        const result = await runResearchCampaign(campaignId);
        await db
          .update(jobs)
          .set({
            status: "completed",
            finishedAt: new Date(),
            result: result as Record<string, unknown>,
          })
          .where(eq(jobs.id, job.id));
        results.push({ id: job.id, type: job.type, ok: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Job failed";
      await db
        .update(jobs)
        .set({
          status: "failed",
          errorMessage: message,
          finishedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));
      results.push({ id: job.id, type: job.type, ok: false, error: message });
    }
  }

  return { processed: results.length, results };
}

export async function enqueueResearchJob(params: {
  workspaceId: string;
  userId: string;
  campaignId: string;
}) {
  const [job] = await db
    .insert(jobs)
    .values({
      workspaceId: params.workspaceId,
      userId: params.userId,
      type: "research.campaign",
      status: "queued",
      payload: { campaignId: params.campaignId },
    })
    .returning();
  return job;
}
