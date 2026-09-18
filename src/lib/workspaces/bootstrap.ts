import { and, count, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  aiUsageEvents,
  documents,
  workspaces,
  workspaceSettings,
} from "@/lib/db/schema";
import { daysUntil } from "@/lib/utils";
import { computeNextBestAction } from "@/lib/planning/planner";

export async function getWorkspaceBootstrap(params: {
  workspaceId: string;
  userId: string;
}) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.id, params.workspaceId),
        eq(workspaces.userId, params.userId),
      ),
    )
    .limit(1);

  if (!workspace) return null;

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  // Sequential-friendly batch: NBA already hits documents/claims; keep extras small.
  const [docStats, spendRows, settings] = await Promise.all([
    db
      .select({
        total: count(),
        ready: sql<number>`sum(case when ${documents.status} = 'ready' then 1 else 0 end)`,
        pending: sql<number>`sum(case when ${documents.status} in ('uploaded','processing','queued') then 1 else 0 end)`,
      })
      .from(documents)
      .where(eq(documents.workspaceId, params.workspaceId)),
    db
      .select({
        spend: sql<number>`coalesce(sum(${aiUsageEvents.estimatedCostUsd}), 0)`,
      })
      .from(aiUsageEvents)
      .where(
        and(
          eq(aiUsageEvents.workspaceId, params.workspaceId),
          gte(aiUsageEvents.createdAt, start),
        ),
      ),
    db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, params.workspaceId))
      .limit(1),
  ]);

  const nextBestAction = await computeNextBestAction({
    workspaceId: params.workspaceId,
    userId: params.userId,
  });

  const statsRow = docStats[0];
  const days = daysUntil(workspace.interviewDate ?? workspace.examDate);

  return {
    workspace,
    settings: settings[0] ?? null,
    nextBestAction,
    stats: {
      daysRemaining: days,
      daysRemainingLabel:
        days === null ? "—" : days < 0 ? `Past by ${Math.abs(days)}d` : String(days),
      documentCount: Number(statsRow?.total ?? 0),
      readyDocuments: Number(statsRow?.ready ?? 0),
      pendingDocuments: Number(statsRow?.pending ?? 0),
      todaySpendUsd: Number(Number(spendRows[0]?.spend ?? 0).toFixed(4)),
    },
  };
}
