import { NextResponse, after } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  researchCampaigns,
  researchQueries,
  workspaces,
} from "@/lib/db/schema";
import { ensureProfile, requireUser } from "@/lib/auth/session";
import {
  buildKvsResearchQueries,
  runResearchCampaign,
} from "@/lib/research/campaign";
import { enqueueResearchJob } from "@/lib/jobs/runner";
import { enqueueJob } from "@/lib/cache/ai-cache";
import { rateLimit } from "@/lib/rate-limit";
import { assertWithinDailyBudget } from "@/lib/analytics/usage";

export const maxDuration = 120;

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  const campaignId = searchParams.get("campaignId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, user.id)))
    .limit(1);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (campaignId) {
    const [campaign] = await db
      .select()
      .from(researchCampaigns)
      .where(
        and(
          eq(researchCampaigns.id, campaignId),
          eq(researchCampaigns.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const queries = await db
      .select()
      .from(researchQueries)
      .where(eq(researchQueries.campaignId, campaignId));
    return NextResponse.json({ campaign, queries });
  }

  const campaigns = await db
    .select()
    .from(researchCampaigns)
    .where(eq(researchCampaigns.workspaceId, workspaceId))
    .orderBy(desc(researchCampaigns.createdAt))
    .limit(20);

  const ids = campaigns.map((c) => c.id);
  const queries =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(researchQueries)
          .where(inArray(researchQueries.campaignId, ids));

  const byCampaign = new Map<string, typeof queries>();
  for (const q of queries) {
    const list = byCampaign.get(q.campaignId) ?? [];
    list.push(q);
    byCampaign.set(q.campaignId, list);
  }

  return NextResponse.json({
    campaigns: campaigns.map((c) => ({
      ...c,
      queries: byCampaign.get(c.id) ?? [],
      progressLog:
        ((c.metadata as { progressLog?: Array<{ at: string; message: string }> } | null)
          ?.progressLog ?? []),
    })),
  });
}

const createSchema = z.object({
  workspaceId: z.string().uuid(),
  topic: z.string().min(3).max(200).optional(),
  depth: z.enum(["quick", "standard", "deep"]).optional(),
  userPrompt: z.string().min(3).max(1000).optional(),
  documentIds: z.array(z.string().uuid()).max(12).optional(),
  useDefaults: z.boolean().optional(),
});

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureProfile(user);

  const limited = await rateLimit({
    key: `research:${user.id}`,
    limit: 8,
    windowSeconds: 60 * 60,
  });
  if (!limited.allowed) {
    return NextResponse.json({ error: "Research rate limit exceeded" }, { status: 429 });
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const {
    workspaceId,
    depth = "quick",
    userPrompt,
    documentIds = [],
    useDefaults = true,
  } = parsed.data;
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, user.id)))
    .limit(1);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertWithinDailyBudget({ workspaceId, userId: user.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Budget exceeded" },
      { status: 429 },
    );
  }

  const topic =
    parsed.data.topic ??
    (userPrompt ? userPrompt.slice(0, 120) : `${workspace.name} preparation research`);

  const [campaign] = await db
    .insert(researchCampaigns)
    .values({
      workspaceId,
      userId: user.id,
      topic,
      depth,
      status: "queued",
      metadata: {
        userPrompt: userPrompt ?? null,
        documentIds,
        useDefaults,
        progressLog: [
          {
            at: new Date().toISOString(),
            message: "Campaign queued — starting web research shortly.",
          },
        ],
      },
    })
    .returning();

  const queries = useDefaults
    ? buildKvsResearchQueries(topic, undefined)
    : buildKvsResearchQueries(topic, userPrompt);
  // If custom prompt with defaults also on, prepend custom queries
  const queryList =
    useDefaults && userPrompt
      ? [
          ...buildKvsResearchQueries(topic, userPrompt).slice(0, 2),
          ...buildKvsResearchQueries(topic).slice(0, depth === "quick" ? 2 : 4),
        ]
      : queries;
  const limit = depth === "quick" ? 2 : depth === "deep" ? 6 : 4;
  await db.insert(researchQueries).values(
    queryList.slice(0, limit).map((q) => ({
      campaignId: campaign.id,
      cluster: q.cluster,
      query: q.query,
      status: "pending",
    })),
  );

  const job = await enqueueResearchJob({
    workspaceId,
    userId: user.id,
    campaignId: campaign.id,
  });
  await enqueueJob("queue:research.campaign", job.id);

  after(async () => {
    try {
      await runResearchCampaign(campaign.id);
    } catch (error) {
      console.error("research.campaign failed", campaign.id, error);
    }
  });

  return NextResponse.json(
    {
      campaign,
      job,
      message: "Research started in background. Watch live progress below.",
    },
    { status: 202 },
  );
}
