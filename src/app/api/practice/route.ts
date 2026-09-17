import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { ensureProfile, requireUser } from "@/lib/auth/session";
import {
  generatePracticeSet,
  listMistakes,
  listPracticeQuestions,
  submitAttempt,
} from "@/lib/planning/practice";
import { rateLimit } from "@/lib/rate-limit";

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
  const view = searchParams.get("view") ?? "questions";
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }
  const workspace = await assertWorkspace(user.id, workspaceId);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (view === "mistakes") {
    const mistakes = await listMistakes(workspaceId);
    return NextResponse.json({ mistakes });
  }

  const questions = await listPracticeQuestions(workspaceId);
  return NextResponse.json({ questions });
}

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  action: z.enum(["generate", "attempt"]),
  topicId: z.string().uuid().optional(),
  questionId: z.string().uuid().optional(),
  selectedOptionId: z.string().uuid().optional(),
  count: z.number().int().min(1).max(5).optional(),
});

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureProfile(user);

  const limited = await rateLimit({
    key: `practice:${user.id}`,
    limit: 30,
    windowSeconds: 60 * 60,
  });
  if (!limited.allowed) {
    return NextResponse.json({ error: "Practice rate limit exceeded" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const workspace = await assertWorkspace(user.id, parsed.data.workspaceId);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.action === "generate") {
    const result = await generatePracticeSet({
      workspaceId: parsed.data.workspaceId,
      userId: user.id,
      topicId: parsed.data.topicId,
      count: parsed.data.count,
    });
    return NextResponse.json(result);
  }

  if (!parsed.data.questionId || !parsed.data.selectedOptionId) {
    return NextResponse.json(
      { error: "questionId and selectedOptionId required" },
      { status: 400 },
    );
  }

  const result = await submitAttempt({
    workspaceId: parsed.data.workspaceId,
    userId: user.id,
    questionId: parsed.data.questionId,
    selectedOptionId: parsed.data.selectedOptionId,
  });
  return NextResponse.json(result);
}
