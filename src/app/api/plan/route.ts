import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { ensureProfile, requireUser } from "@/lib/auth/session";
import {
  completeTask,
  createAdaptivePlan,
  listPlanBundle,
} from "@/lib/planning/planner";
import { listSyllabus, generateSyllabus } from "@/lib/planning/syllabus";
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
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }
  const workspace = await assertWorkspace(user.id, workspaceId);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [planBundle, syllabus] = await Promise.all([
    listPlanBundle(workspaceId),
    listSyllabus(workspaceId),
  ]);
  return NextResponse.json({ ...planBundle, ...syllabus });
}

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  action: z.enum(["generate", "complete_task", "syllabus"]).default("generate"),
  taskId: z.string().uuid().optional(),
  days: z.number().int().min(7).max(30).optional(),
});

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureProfile(user);

  const limited = await rateLimit({
    key: `plan:${user.id}`,
    limit: 20,
    windowSeconds: 60 * 60,
  });
  if (!limited.allowed) {
    return NextResponse.json({ error: "Plan rate limit exceeded" }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const workspace = await assertWorkspace(user.id, parsed.data.workspaceId);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.data.action === "syllabus") {
    const syllabus = await generateSyllabus({
      workspaceId: parsed.data.workspaceId,
      userId: user.id,
    });
    return NextResponse.json(syllabus);
  }

  if (parsed.data.action === "complete_task") {
    if (!parsed.data.taskId) {
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    }
    const task = await completeTask({
      workspaceId: parsed.data.workspaceId,
      taskId: parsed.data.taskId,
    });
    return NextResponse.json({ task });
  }

  const result = await createAdaptivePlan({
    workspaceId: parsed.data.workspaceId,
    userId: user.id,
    days: parsed.data.days,
  });
  return NextResponse.json(result);
}
