import { NextResponse } from "next/server";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  aiUsageEvents,
  documents,
  workspaces,
  workspaceSettings,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { daysUntil } from "@/lib/utils";
import { computeNextBestAction } from "@/lib/planning/planner";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, id), eq(workspaces.userId, user.id)))
    .limit(1);

  if (!workspace) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const [docStats, spendRows, settings, nextBestAction] = await Promise.all([
    db
      .select({
        total: count(),
        ready: sql<number>`sum(case when ${documents.status} = 'ready' then 1 else 0 end)`,
        pending: sql<number>`sum(case when ${documents.status} in ('uploaded','processing','queued') then 1 else 0 end)`,
      })
      .from(documents)
      .where(eq(documents.workspaceId, id)),
    db
      .select({
        spend: sql<number>`coalesce(sum(${aiUsageEvents.estimatedCostUsd}), 0)`,
      })
      .from(aiUsageEvents)
      .where(
        and(
          eq(aiUsageEvents.workspaceId, id),
          gte(aiUsageEvents.createdAt, start),
        ),
      ),
    db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, id))
      .limit(1),
    computeNextBestAction({ workspaceId: id, userId: user.id }),
  ]);

  const statsRow = docStats[0];
  const days = daysUntil(workspace.interviewDate ?? workspace.examDate);

  return NextResponse.json({
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
  });
}
