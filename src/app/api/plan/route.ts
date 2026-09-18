import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { workspaceSettings, workspaces } from "@/lib/db/schema";
import { ensureProfile, requireUser } from "@/lib/auth/session";
import {
  applyPlanIntake,
  completeTask,
  createAdaptivePlan,
  listPlanBundle,
} from "@/lib/planning/planner";
import {
  draftToPlanIntake,
  extractOnboardingText,
  savePartialIntake,
  type IntakeDraft,
} from "@/lib/planning/onboarding";
import { listSyllabus, generateSyllabus } from "@/lib/planning/syllabus";
import { rateLimit } from "@/lib/rate-limit";
import { invalidateNba } from "@/lib/cache/ai-cache";
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
  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }
  const workspace = await assertWorkspace(user.id, workspaceId);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [planBundle, syllabus, settings] = await Promise.all([
    listPlanBundle(workspaceId),
    listSyllabus(workspaceId),
    db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId))
      .limit(1),
  ]);

  const intake =
    (settings[0]?.settings as { intake?: Record<string, unknown> } | null)?.intake ??
    null;

  return NextResponse.json({
    ...planBundle,
    ...syllabus,
    intake,
    workspace: {
      interviewDate: workspace.interviewDate,
      dailyStudyHours: workspace.dailyStudyHours,
    },
  });
}

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  action: z
    .enum([
      "generate",
      "complete_task",
      "syllabus",
      "intake",
      "intake_partial",
      "onboarding_extract",
      "onboarding_finish",
    ])
    .default("generate"),
  taskId: z.string().uuid().optional(),
  days: z.number().int().min(7).max(30).optional(),
  extractStep: z.enum(["intro", "date", "constraints"]).optional(),
  text: z.string().max(1200).optional(),
  intake: z
    .object({
      daysUntilInterview: z.number().int().min(1).max(120),
      hoursPerDay: z.number().min(0.5).max(8),
      weakAreas: z.array(z.string()).max(8),
      strongAreas: z.array(z.string()).max(8),
      goals: z.string().min(3).max(500),
      candidateName: z.string().max(80).optional(),
      currentStage: z.string().max(120).optional(),
      constraintsNote: z.string().max(400).optional(),
      daysPerWeek: z.number().int().min(1).max(7).optional(),
    })
    .optional(),
  patch: z
    .object({
      daysUntilInterview: z.number().int().min(1).max(120).optional(),
      hoursPerDay: z.number().min(0.5).max(8).optional(),
      weakAreas: z.array(z.string()).max(8).optional(),
      strongAreas: z.array(z.string()).max(8).optional(),
      goals: z.string().max(500).optional(),
      candidateName: z.string().max(80).optional(),
      currentStage: z.string().max(120).optional(),
      constraintsNote: z.string().max(400).optional(),
      daysPerWeek: z.number().int().min(1).max(7).optional(),
      onboardingStep: z.number().int().min(0).max(8).optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureProfile(user);

  const limited = await rateLimit({
    key: `plan:${user.id}`,
    limit: 40,
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

  if (parsed.data.action === "intake") {
    if (!parsed.data.intake) {
      return NextResponse.json({ error: "intake required" }, { status: 400 });
    }
    const result = await applyPlanIntake({
      workspaceId: parsed.data.workspaceId,
      userId: user.id,
      intake: parsed.data.intake,
    });
    await invalidateNba(parsed.data.workspaceId);
    return NextResponse.json(result);
  }

  if (parsed.data.action === "intake_partial") {
    const intake = await savePartialIntake({
      workspaceId: parsed.data.workspaceId,
      patch: parsed.data.patch ?? {},
    });
    return NextResponse.json({ intake });
  }

  if (parsed.data.action === "onboarding_extract") {
    if (!parsed.data.text || !parsed.data.extractStep) {
      return NextResponse.json({ error: "text and extractStep required" }, { status: 400 });
    }
    await assertWithinDailyBudget({
      workspaceId: parsed.data.workspaceId,
      userId: user.id,
    });
    const extracted = await extractOnboardingText({
      userId: user.id,
      workspaceId: parsed.data.workspaceId,
      step: parsed.data.extractStep,
      text: parsed.data.text,
    });
    return NextResponse.json(extracted);
  }

  if (parsed.data.action === "onboarding_finish") {
    const [settings] = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, parsed.data.workspaceId))
      .limit(1);
    const draft = {
      ...(((settings?.settings as { intake?: Record<string, unknown> } | null)
        ?.intake ?? {}) as Record<string, unknown>),
      ...(parsed.data.patch ?? {}),
    };
    const intake = draftToPlanIntake(draft as IntakeDraft);
    await savePartialIntake({
      workspaceId: parsed.data.workspaceId,
      patch: { ...intake, onboardingStep: 8 },
    });
    const result = await applyPlanIntake({
      workspaceId: parsed.data.workspaceId,
      userId: user.id,
      intake,
    });
    await invalidateNba(parsed.data.workspaceId);
    return NextResponse.json(result);
  }

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
    await invalidateNba(parsed.data.workspaceId);
    return NextResponse.json({ task });
  }

  const result = await createAdaptivePlan({
    workspaceId: parsed.data.workspaceId,
    userId: user.id,
    days: parsed.data.days,
  });
  await invalidateNba(parsed.data.workspaceId);
  return NextResponse.json(result);
}
