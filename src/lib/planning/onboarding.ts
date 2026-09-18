import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaceSettings, workspaces } from "@/lib/db/schema";
import { chatCompletion } from "@/lib/ai/responses";
import { MODELS } from "@/lib/ai/models";
import { onboardingExtractSystem } from "@prompts";
import type { PlanIntake } from "./planner";

export type IntakeDraft = Partial<PlanIntake> & {
  candidateName?: string;
  currentStage?: string;
  constraintsNote?: string;
  daysPerWeek?: number;
  onboardingStep?: number;
};

const extractSchema = z.object({
  extracted: z.object({
    candidateName: z.string().nullable().optional(),
    currentStage: z.string().nullable().optional(),
    interviewDate: z.string().nullable().optional(),
    daysUntilInterview: z.number().int().min(1).max(120).nullable().optional(),
    constraintsNote: z.string().nullable().optional(),
  }),
  clarifyingFollowUpNeeded: z.boolean().optional(),
});

export async function savePartialIntake(params: {
  workspaceId: string;
  patch: IntakeDraft;
}) {
  const [settings] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, params.workspaceId))
    .limit(1);

  const prev = ((settings?.settings as { intake?: IntakeDraft } | null)?.intake ??
    {}) as IntakeDraft;
  const intake: IntakeDraft = { ...prev, ...params.patch };

  const workspacePatch: {
    interviewDate?: Date;
    dailyStudyHours?: number;
    currentStage?: string;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (typeof intake.daysUntilInterview === "number") {
    const interviewDate = new Date();
    interviewDate.setHours(12, 0, 0, 0);
    interviewDate.setDate(
      interviewDate.getDate() + Math.max(1, Math.min(intake.daysUntilInterview, 120)),
    );
    workspacePatch.interviewDate = interviewDate;
  }
  if (typeof intake.hoursPerDay === "number") {
    workspacePatch.dailyStudyHours = intake.hoursPerDay;
  }
  if (intake.currentStage) {
    workspacePatch.currentStage = intake.currentStage;
  }

  await db
    .update(workspaces)
    .set(workspacePatch)
    .where(eq(workspaces.id, params.workspaceId));

  const nextSettings = {
    ...(settings?.settings ?? {}),
    intake,
  };

  if (settings) {
    await db
      .update(workspaceSettings)
      .set({ settings: nextSettings, updatedAt: new Date() })
      .where(eq(workspaceSettings.workspaceId, params.workspaceId));
  } else {
    await db.insert(workspaceSettings).values({
      workspaceId: params.workspaceId,
      maxDailyAiSpendUsd: 1.5,
      settings: nextSettings,
    });
  }

  return intake;
}

export async function extractOnboardingText(params: {
  userId: string;
  workspaceId: string;
  step: "intro" | "date" | "constraints";
  text: string;
}) {
  const result = await chatCompletion({
    model: MODELS.fast,
    system: onboardingExtractSystem,
    user: `Step: ${params.step}\nUser said:\n${params.text.slice(0, 1200)}`,
    userId: params.userId,
    workspaceId: params.workspaceId,
    feature: "onboarding_extract",
    temperature: 0,
    maxTokens: 220,
  });

  try {
    const match = result.content.match(/\{[\s\S]*\}/);
    const parsed = extractSchema.safeParse(JSON.parse(match ? match[0] : "{}"));
    if (parsed.success) return parsed.data;
  } catch {
    // fall through
  }
  return {
    extracted: {},
    clarifyingFollowUpNeeded: false,
  };
}

export function draftToPlanIntake(draft: IntakeDraft): PlanIntake {
  const daysUntilInterview = Math.max(
    1,
    Math.min(draft.daysUntilInterview ?? 21, 120),
  );
  const hoursPerDay = Math.max(0.5, Math.min(draft.hoursPerDay ?? 1.5, 8));
  const goals =
    draft.goals?.trim() ||
    (draft.constraintsNote
      ? `Clear KVS PRT interview. Constraint: ${draft.constraintsNote}`
      : "Clear KVS PRT interview with calm, example-rich answers");

  return {
    daysUntilInterview,
    hoursPerDay,
    weakAreas: draft.weakAreas ?? [],
    strongAreas: draft.strongAreas ?? [],
    goals,
    candidateName: draft.candidateName,
    currentStage: draft.currentStage,
    constraintsNote: draft.constraintsNote,
    daysPerWeek: draft.daysPerWeek,
  };
}
