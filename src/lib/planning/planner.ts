import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  claims,
  documents,
  interviewSessions,
  mistakeEvents,
  studyPlans,
  tasks,
  userSkillStates,
  workspaceSettings,
  workspaces,
} from "@/lib/db/schema";
import { generateSyllabus } from "./syllabus";
import { daysUntil } from "@/lib/utils";
import { cacheGet, cacheSet, nbaCacheKey } from "@/lib/cache/ai-cache";
import { DEFAULT_DAILY_AI_USD } from "@/lib/budget";

export async function createAdaptivePlan(params: {
  workspaceId: string;
  userId: string;
  days?: number;
  hoursPerDay?: number;
}) {
  const syllabus = await generateSyllabus(params);
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, params.workspaceId))
    .limit(1);
  if (!workspace) throw new Error("Workspace not found");

  await db
    .update(studyPlans)
    .set({ status: "archived", updatedAt: new Date() })
    .where(
      and(
        eq(studyPlans.workspaceId, params.workspaceId),
        eq(studyPlans.status, "active"),
      ),
    );

  const daysLeft = daysUntil(workspace.interviewDate);
  const horizon =
    params.days ??
    Math.min(Math.max(daysLeft != null && daysLeft > 0 ? daysLeft : 14, 7), 21);
  const hoursPerDay = params.hoursPerDay ?? workspace.dailyStudyHours ?? 1.5;
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + horizon);

  const skills = await db
    .select()
    .from(userSkillStates)
    .where(eq(userSkillStates.workspaceId, params.workspaceId));
  const skillByTopic = new Map(skills.map((s) => [s.topicId, s]));

  const rankedTopics = [...syllabus.topics].sort((a, b) => {
    const aMastery = skillByTopic.get(a.id)?.mastery ?? 0.2;
    const bMastery = skillByTopic.get(b.id)?.mastery ?? 0.2;
    const aScore = (a.importance ?? 0.5) * (1 - aMastery);
    const bScore = (b.importance ?? 0.5) * (1 - bMastery);
    return bScore - aScore;
  });

  const [plan] = await db
    .insert(studyPlans)
    .values({
      workspaceId: params.workspaceId,
      userId: params.userId,
      title: `${workspace.name} — ${horizon}-day plan`,
      status: "active",
      summary: `Personal ${horizon}-day plan (~${hoursPerDay}h/day) from intake + mastery. Weak topics get earlier slots.`,
      startDate: start,
      endDate: end,
      metadata: {
        topicCount: rankedTopics.length,
        horizon,
        hoursPerDay,
      },
    })
    .returning();

  const createdTasks = [];
  for (let day = 0; day < horizon; day += 1) {
    const topic = rankedTopics[day % Math.max(rankedTopics.length, 1)];
    const due = new Date(start);
    due.setDate(start.getDate() + day);
    due.setHours(20, 0, 0, 0);

    const [task] = await db
      .insert(tasks)
      .values({
        workspaceId: params.workspaceId,
        planId: plan.id,
        topicId: topic?.id ?? null,
        title: topic
          ? `Study: ${topic.name}`
          : "Review KVS PRT interview fundamentals",
        description: topic?.description ?? "Focused preparation block",
        taskType: day % 3 === 2 ? "practice" : "study",
        status: "pending",
        priority: day < 3 ? "high" : "medium",
        estimatedMinutes: Math.round(hoursPerDay * 60),
        dueDate: due,
        metadata: { dayOffset: day },
      })
      .returning();
    createdTasks.push(task);

    if (day % 3 === 2 && topic) {
      const [quizTask] = await db
        .insert(tasks)
        .values({
          workspaceId: params.workspaceId,
          planId: plan.id,
          topicId: topic.id,
          title: `Practice quiz: ${topic.name}`,
          description: "Answer grounded MCQs and log mistakes for remediation.",
          taskType: "quiz",
          status: "pending",
          priority: "high",
          estimatedMinutes: 20,
          dueDate: due,
        })
        .returning();
      createdTasks.push(quizTask);
    }
  }

  return { plan, tasks: createdTasks, syllabus };
}

export async function listPlanBundle(workspaceId: string) {
  const [plan] = await db
    .select()
    .from(studyPlans)
    .where(
      and(eq(studyPlans.workspaceId, workspaceId), eq(studyPlans.status, "active")),
    )
    .orderBy(desc(studyPlans.createdAt))
    .limit(1);

  const planTasks = plan
    ? await db
        .select()
        .from(tasks)
        .where(eq(tasks.planId, plan.id))
        .orderBy(asc(tasks.dueDate))
    : [];

  return { plan: plan ?? null, tasks: planTasks };
}

export async function completeTask(params: {
  workspaceId: string;
  taskId: string;
}) {
  const [task] = await db
    .update(tasks)
    .set({ status: "completed", completedAt: new Date() })
    .where(and(eq(tasks.id, params.taskId), eq(tasks.workspaceId, params.workspaceId)))
    .returning();
  return task;
}

export type NextBestAction = {
  title: string;
  why: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  minutes: number;
  href: string;
  taskId?: string;
};

export async function computeNextBestAction(params: {
  workspaceId: string;
  userId: string;
}): Promise<NextBestAction> {
  const cached = await cacheGet<NextBestAction>(nbaCacheKey(params.workspaceId));
  if (cached?.title) return cached;

  const action = await computeNextBestActionFresh(params);
  await cacheSet(nbaCacheKey(params.workspaceId), action, 90);
  return action;
}

async function computeNextBestActionFresh(params: {
  workspaceId: string;
  userId: string;
}): Promise<NextBestAction> {
  const [pendingClaims, conflictingClaims, docStats, openMistakes, dueTasks, lastMock] =
    await Promise.all([
      db
        .select({ id: claims.id })
        .from(claims)
        .where(
          and(
            eq(claims.workspaceId, params.workspaceId),
            eq(claims.status, "CANDIDATE"),
          ),
        )
        .limit(12),
      db
        .select({ id: claims.id })
        .from(claims)
        .where(
          and(
            eq(claims.workspaceId, params.workspaceId),
            eq(claims.status, "CONFLICTING"),
          ),
        )
        .limit(3),
      db
        .select({
          total: count(),
          ready: sql<number>`sum(case when ${documents.status} = 'ready' then 1 else 0 end)`,
          pending: sql<number>`sum(case when ${documents.status} in ('uploaded','processing','queued') then 1 else 0 end)`,
        })
        .from(documents)
        .where(eq(documents.workspaceId, params.workspaceId)),
      db
        .select()
        .from(mistakeEvents)
        .where(eq(mistakeEvents.workspaceId, params.workspaceId))
        .orderBy(desc(mistakeEvents.createdAt))
        .limit(5),
      db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.workspaceId, params.workspaceId),
            eq(tasks.status, "pending"),
          ),
        )
        .orderBy(asc(tasks.dueDate))
        .limit(20),
      db
        .select({
          report: interviewSessions.report,
          overallScore: interviewSessions.overallScore,
          endedAt: interviewSessions.endedAt,
        })
        .from(interviewSessions)
        .where(
          and(
            eq(interviewSessions.workspaceId, params.workspaceId),
            eq(interviewSessions.status, "completed"),
          ),
        )
        .orderBy(desc(interviewSessions.endedAt))
        .limit(1),
    ]);

  const readyDocs = Number(docStats[0]?.ready ?? 0);
  const pendingDocs = Number(docStats[0]?.pending ?? 0);
  const hasCompletedMock = Boolean(lastMock[0]);

  // 1. Interview-first: zero completed mocks → run first panel (never claims/docs).
  if (!hasCompletedMock) {
    return {
      title: "Run your first mock panel interview",
      why: "This is the real panel practice — everything else supports it.",
      priority: "HIGH" as const,
      minutes: 10,
      href: "interview/mock",
    };
  }

  // 2. Fresh mock focus recommendation (7-day window for short prep cycles).
  const recs = (
    lastMock[0]?.report as {
      focusRecommendations?: Array<{
        topic?: string;
        reason?: string;
        suggestedAction?: string;
      }>;
    } | null
  )?.focusRecommendations;
  const rec = recs?.[0];
  const endedAt = lastMock[0]?.endedAt;
  const mockIsFresh =
    endedAt != null &&
    Date.now() - new Date(endedAt).getTime() < 1000 * 60 * 60 * 24 * 7;
  const mockNeedsWork =
    lastMock[0]?.overallScore == null || Number(lastMock[0].overallScore) < 8;
  if (rec?.suggestedAction && mockIsFresh && mockNeedsWork) {
    return {
      title: rec.suggestedAction.slice(0, 80),
      why: rec.reason
        ? `${rec.topic ?? "Last mock"}: ${rec.reason}`
        : "From your last mock panel — highest-leverage fix.",
      priority: "HIGH" as const,
      minutes: 20,
      href: "learn",
    };
  }

  // 3. Pending interview drills from eval.
  const interviewDrills = dueTasks.filter((t) => t.taskType === "interview_drill");
  if (interviewDrills[0]) {
    return {
      title: interviewDrills[0].title,
      why: "Post-mock interview remediation is high leverage close to interview day.",
      priority: "HIGH" as const,
      minutes: interviewDrills[0].estimatedMinutes ?? 20,
      href: "interview",
      taskId: interviewDrills[0].id,
    };
  }

  // 4. Mistake remediation.
  if (openMistakes.length >= 3) {
    return {
      title: "Remediate recent mistakes",
      why: "Repeated errors should be fixed before the next panel run.",
      priority: "HIGH" as const,
      minutes: 20,
      href: "learn/mistakes",
    };
  }

  // 5. Today's plan tasks / next pending.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const todays = dueTasks.filter((t) => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    return d >= today && d < tomorrow;
  });

  if (todays[0]) {
    return {
      title: todays[0].title,
      why: todays[0].description ?? "Scheduled for today in your adaptive plan.",
      priority: (todays[0].priority?.toUpperCase() as "HIGH" | "MEDIUM" | "LOW") || "HIGH",
      minutes: todays[0].estimatedMinutes ?? 25,
      href: "",
      taskId: todays[0].id,
    };
  }

  // 6. Claims only when inbox is genuinely blocking (≥8) or conflicts exist.
  if (conflictingClaims.length > 0 || pendingClaims.length >= 8) {
    const n = conflictingClaims.length > 0
      ? conflictingClaims.length
      : pendingClaims.length;
    return {
      title: `Review ${n}+ research claim(s)`,
      why:
        conflictingClaims.length > 0
          ? "Conflicting evidence needs your call before it shapes prep."
          : "Large unapproved inbox — clear it so mentor stays grounded.",
      priority: "MEDIUM" as const,
      minutes: 10,
      href: "memory",
    };
  }

  // 7. Docs soft secondary — only after at least one mock.
  if (readyDocs === 0) {
    return {
      title: "Upload official KVS PDFs",
      why: "Ground the next mock and mentor answers in your documents.",
      priority: "MEDIUM" as const,
      minutes: 10,
      href: "memory?tab=documents",
    };
  }

  if (pendingDocs > 0) {
    return {
      title: "Wait for document indexing",
      why: `${pendingDocs} document(s) are still being processed.`,
      priority: "LOW" as const,
      minutes: 5,
      href: "memory?tab=documents",
    };
  }

  if (!dueTasks.length) {
    return {
      title: "Run another mock panel",
      why: "Keep sharpening panel answers until interview day.",
      priority: "HIGH" as const,
      minutes: 10,
      href: "interview/mock",
    };
  }

  return {
    title: dueTasks[0]!.title,
    why: "Next pending task from your preparation plan.",
    priority: "MEDIUM" as const,
    minutes: dueTasks[0]!.estimatedMinutes ?? 25,
    href: "",
    taskId: dueTasks[0]!.id,
  };
}

export type PlanIntake = {
  daysUntilInterview: number;
  hoursPerDay: number;
  weakAreas: string[];
  strongAreas: string[];
  goals: string;
  candidateName?: string;
  currentStage?: string;
  constraintsNote?: string;
  daysPerWeek?: number;
};

export async function applyPlanIntake(params: {
  workspaceId: string;
  userId: string;
  intake: PlanIntake;
}) {
  const interviewDate = new Date();
  interviewDate.setHours(12, 0, 0, 0);
  interviewDate.setDate(
    interviewDate.getDate() + Math.max(1, Math.min(params.intake.daysUntilInterview, 120)),
  );

  await db
    .update(workspaces)
    .set({
      interviewDate,
      dailyStudyHours: params.intake.hoursPerDay,
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, params.workspaceId));

  const [settings] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, params.workspaceId))
    .limit(1);

  const nextSettings = {
    ...(settings?.settings ?? {}),
    intake: {
      ...params.intake,
      completedAt: new Date().toISOString(),
    },
  };

  if (settings) {
    await db
      .update(workspaceSettings)
      .set({ settings: nextSettings, updatedAt: new Date() })
      .where(eq(workspaceSettings.workspaceId, params.workspaceId));
  } else {
    await db.insert(workspaceSettings).values({
      workspaceId: params.workspaceId,
      maxDailyAiSpendUsd: DEFAULT_DAILY_AI_USD,
      settings: nextSettings,
    });
  }

  // Ensure syllabus exists so we can seed skill states
  const syllabus = await generateSyllabus({
    workspaceId: params.workspaceId,
    userId: params.userId,
  });

  const weak = new Set(params.intake.weakAreas.map((s) => s.toLowerCase()));
  const strong = new Set(params.intake.strongAreas.map((s) => s.toLowerCase()));

  for (const topic of syllabus.topics) {
    const name = topic.name.toLowerCase();
    let mastery = 0.35;
    if ([...weak].some((w) => name.includes(w) || w.includes(name))) mastery = 0.15;
    if ([...strong].some((s) => name.includes(s) || s.includes(name))) mastery = 0.7;

    const existing = await db
      .select()
      .from(userSkillStates)
      .where(
        and(
          eq(userSkillStates.workspaceId, params.workspaceId),
          eq(userSkillStates.topicId, topic.id),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(userSkillStates)
        .set({ mastery, updatedAt: new Date() })
        .where(eq(userSkillStates.id, existing[0].id));
    } else {
      await db.insert(userSkillStates).values({
        workspaceId: params.workspaceId,
        userId: params.userId,
        topicId: topic.id,
        subjectId: topic.subjectId,
        mastery,
      });
    }
  }

  const plan = await createAdaptivePlan({
    workspaceId: params.workspaceId,
    userId: params.userId,
    days: Math.min(Math.max(params.intake.daysUntilInterview, 7), 21),
    hoursPerDay: params.intake.hoursPerDay,
  });

  return { intake: params.intake, interviewDate, ...plan };
}
