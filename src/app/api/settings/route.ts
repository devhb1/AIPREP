import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { notifications, workspaceSettings, workspaces } from "@/lib/db/schema";
import { ensureProfile, requireUser } from "@/lib/auth/session";
import { getUsageSummary } from "@/lib/analytics/usage";
import { buildTasksIcs, exportWorkspaceBundle } from "@/lib/export/workspace";
import { resetWorkspaceContent } from "@/lib/workspaces/reset";

async function assertWorkspace(userId: string, workspaceId: string) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)))
    .limit(1);
  return workspace ?? null;
}

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  const view = searchParams.get("view") ?? "usage";
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }

  const workspace = await assertWorkspace(user.id, workspaceId);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (view === "export") {
    const bundle = await exportWorkspaceBundle({
      workspaceId,
      userId: user.id,
    });
    return NextResponse.json(bundle);
  }

  if (view === "calendar") {
    const ics = await buildTasksIcs({ workspaceId, userId: user.id });
    return new NextResponse(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="aiprep-${workspaceId}.ics"`,
      },
    });
  }

  if (view === "notifications") {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .limit(30);
    return NextResponse.json({ notifications: rows });
  }

  const [settings] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .limit(1);

  const usage = await getUsageSummary({ workspaceId, userId: user.id });
  return NextResponse.json({
    workspace,
    settings: settings ?? {
      workspaceId,
      maxDailyAiSpendUsd: 5,
      maxResearchQueries: 20,
      settings: {},
    },
    usage,
  });
}

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  action: z.enum([
    "update_settings",
    "mark_notification_read",
    "create_notification",
    "reset_workspace",
  ]),
  maxDailyAiSpendUsd: z.number().min(0.1).max(50).optional(),
  maxDailyVoiceSpendUsd: z.number().min(0.1).max(50).optional(),
  maxResearchQueries: z.number().int().min(1).max(100).optional(),
  notificationId: z.string().uuid().optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  confirmText: z.string().optional(),
});

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureProfile(user);

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const workspace = await assertWorkspace(user.id, parsed.data.workspaceId);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.action === "reset_workspace") {
    if (parsed.data.confirmText?.trim().toUpperCase() !== "RESET") {
      return NextResponse.json(
        { error: "Type RESET to confirm workspace wipe" },
        { status: 400 },
      );
    }
    try {
      const result = await resetWorkspaceContent({
        workspaceId: parsed.data.workspaceId,
        userId: user.id,
      });
      return NextResponse.json({
        message:
          "Workspace prep data cleared. Re-run research, upload PDFs, and plan intake.",
        ...result,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Reset failed" },
        { status: 500 },
      );
    }
  }

  if (parsed.data.action === "update_settings") {
    const existing = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, parsed.data.workspaceId))
      .limit(1);

    const nextExtra = {
      ...((existing[0]?.settings as Record<string, unknown> | null) ?? {}),
      ...(parsed.data.maxDailyVoiceSpendUsd != null
        ? { maxDailyVoiceSpendUsd: parsed.data.maxDailyVoiceSpendUsd }
        : {}),
    };

    if (existing[0]) {
      const [updated] = await db
        .update(workspaceSettings)
        .set({
          maxDailyAiSpendUsd:
            parsed.data.maxDailyAiSpendUsd ?? existing[0].maxDailyAiSpendUsd,
          maxResearchQueries:
            parsed.data.maxResearchQueries ?? existing[0].maxResearchQueries,
          settings: nextExtra,
          updatedAt: new Date(),
        })
        .where(eq(workspaceSettings.workspaceId, parsed.data.workspaceId))
        .returning();
      return NextResponse.json({ settings: updated });
    }

    const [created] = await db
      .insert(workspaceSettings)
      .values({
        workspaceId: parsed.data.workspaceId,
        maxDailyAiSpendUsd: parsed.data.maxDailyAiSpendUsd ?? 5,
        maxResearchQueries: parsed.data.maxResearchQueries ?? 20,
        settings: nextExtra,
      })
      .returning();
    return NextResponse.json({ settings: created });
  }

  if (parsed.data.action === "create_notification") {
    const [row] = await db
      .insert(notifications)
      .values({
        userId: user.id,
        workspaceId: parsed.data.workspaceId,
        title: parsed.data.title ?? "AIPREP update",
        body: parsed.data.body ?? null,
        kind: "info",
      })
      .returning();
    return NextResponse.json({ notification: row });
  }

  if (!parsed.data.notificationId) {
    return NextResponse.json({ error: "notificationId required" }, { status: 400 });
  }

  const [updated] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, parsed.data.notificationId),
        eq(notifications.userId, user.id),
      ),
    )
    .returning();

  return NextResponse.json({ notification: updated });
}
