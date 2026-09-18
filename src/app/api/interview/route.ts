import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { interviewChecklists, workspaces } from "@/lib/db/schema";
import { ensureProfile, requireUser } from "@/lib/auth/session";
import {
  answerInterviewTurn,
  endInterviewSession,
  ensureInterviewChecklist,
  getInterviewSession,
  listAnswerLibrary,
  listInterviewSessions,
  listPersonalStories,
  addPersonalStory,
  startInterviewSession,
  type JudgeMode,
} from "@/lib/interview/session";
import { rateLimit } from "@/lib/rate-limit";
import { assertWithinDailyBudget } from "@/lib/analytics/usage";

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
  const view = searchParams.get("view") ?? "sessions";
  const sessionId = searchParams.get("sessionId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }
  const workspace = await assertWorkspace(user.id, workspaceId);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (sessionId) {
    const detail = await getInterviewSession({
      sessionId,
      workspaceId,
      userId: user.id,
    });
    if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(detail);
  }

  if (view === "checklist") {
    const checklist = await ensureInterviewChecklist({
      workspaceId,
      userId: user.id,
    });
    return NextResponse.json({ checklist });
  }

  if (view === "library") {
    const library = await listAnswerLibrary(workspaceId);
    return NextResponse.json({ library });
  }

  if (view === "stories") {
    const stories = await listPersonalStories(workspaceId);
    return NextResponse.json({ stories });
  }

  const sessions = await listInterviewSessions(workspaceId);
  return NextResponse.json({ sessions });
}

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  action: z.enum([
    "start",
    "answer",
    "end",
    "checklist",
    "toggle_checklist_item",
    "add_story",
  ]),
  sessionId: z.string().uuid().optional(),
  answer: z.string().min(1).max(8000).optional(),
  judgeMode: z.enum(["easy", "normal", "strict"]).optional(),
  targetMinutes: z.number().int().min(5).max(45).optional(),
  itemId: z.string().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureProfile(user);

  const limited = await rateLimit({
    key: `interview:${user.id}`,
    limit: 40,
    windowSeconds: 60 * 60,
  });
  if (!limited.allowed) {
    return NextResponse.json({ error: "Interview rate limit exceeded" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const workspace = await assertWorkspace(user.id, parsed.data.workspaceId);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { action, workspaceId } = parsed.data;

  if (action === "checklist") {
    const checklist = await ensureInterviewChecklist({
      workspaceId,
      userId: user.id,
    });
    return NextResponse.json({ checklist });
  }

  if (action === "toggle_checklist_item") {
    if (!parsed.data.itemId) {
      return NextResponse.json({ error: "itemId required" }, { status: 400 });
    }
    const checklist = await ensureInterviewChecklist({
      workspaceId,
      userId: user.id,
    });
    const items = (checklist.items ?? []).map((item) =>
      item.id === parsed.data.itemId ? { ...item, done: !item.done } : item,
    );
    const [updated] = await db
      .update(interviewChecklists)
      .set({ items, updatedAt: new Date() })
      .where(eq(interviewChecklists.id, checklist.id))
      .returning();
    return NextResponse.json({ checklist: updated });
  }

  if (action === "add_story") {
    if (!parsed.data.title || !parsed.data.content) {
      return NextResponse.json({ error: "title and content required" }, { status: 400 });
    }
    const story = await addPersonalStory({
      workspaceId,
      userId: user.id,
      title: parsed.data.title,
      content: parsed.data.content,
      tags: parsed.data.tags,
    });
    return NextResponse.json({ story });
  }

  if (action === "start") {
    try {
      await assertWithinDailyBudget({ workspaceId, userId: user.id });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Budget exceeded" },
        { status: 429 },
      );
    }
    try {
      const result = await startInterviewSession({
        workspaceId,
        userId: user.id,
        judgeMode: (parsed.data.judgeMode as JudgeMode) ?? "normal",
        targetMinutes: parsed.data.targetMinutes,
      });
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Could not start interview",
        },
        { status: 500 },
      );
    }
  }

  if (!parsed.data.sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  if (action === "answer") {
    if (!parsed.data.answer) {
      return NextResponse.json({ error: "answer required" }, { status: 400 });
    }
    try {
      await assertWithinDailyBudget({ workspaceId, userId: user.id });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Budget exceeded" },
        { status: 429 },
      );
    }
    try {
      const result = await answerInterviewTurn({
        sessionId: parsed.data.sessionId,
        workspaceId,
        userId: user.id,
        answer: parsed.data.answer,
      });
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Could not process answer",
        },
        { status: 500 },
      );
    }
  }

  try {
    const result = await endInterviewSession({
      sessionId: parsed.data.sessionId,
      workspaceId,
      userId: user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not end interview",
      },
      { status: 500 },
    );
  }
}
