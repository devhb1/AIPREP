import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  claims,
  documents,
  mistakeEvents,
  studyPlans,
  tasks,
  userSkillStates,
  workspaces,
} from "@/lib/db/schema";
import { generateSyllabus } from "./syllabus";
import { daysUntil } from "@/lib/utils";

export async function createAdaptivePlan(params: {
  workspaceId: string;
  userId: string;
  days?: number;
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

  const horizon = params.days ?? Math.min(Math.max(daysUntil(workspace.interviewDate) ?? 14, 7), 21);
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
      summary:
        "Adaptive plan from syllabus importance + current mastery. Weak topics get earlier slots.",
      startDate: start,
      endDate: end,
      metadata: { topicCount: rankedTopics.length, horizon },
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
        estimatedMinutes: workspace.dailyStudyHours
          ? Math.round(workspace.dailyStudyHours * 60)
          : 25,
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

export async function computeNextBestAction(params: {
  workspaceId: string;
  userId: string;
}) {
  const pendingClaims = await db
    .select()
    .from(claims)
    .where(
      and(
        eq(claims.workspaceId, params.workspaceId),
        inArray(claims.status, ["CANDIDATE", "CONFLICTING"]),
      ),
    )
    .limit(5);

  if (pendingClaims.length) {
    return {
      title: `Review ${pendingClaims.length}+ research claim(s)`,
      why: "Unapproved evidence should not drive your plan.",
      priority: "HIGH" as const,
      minutes: 10,
      href: "inbox",
    };
  }

  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.workspaceId, params.workspaceId));
  const readyDocs = docs.filter((d) => d.status === "ready").length;
  if (readyDocs === 0) {
    return {
      title: "Upload official KVS PDFs",
      why: "Syllabus and quizzes need grounded source material.",
      priority: "HIGH" as const,
      minutes: 10,
      href: "documents",
    };
  }

  const openMistakes = await db
    .select()
    .from(mistakeEvents)
    .where(eq(mistakeEvents.workspaceId, params.workspaceId))
    .orderBy(desc(mistakeEvents.createdAt))
    .limit(5);
  if (openMistakes.length >= 3) {
    return {
      title: "Remediate recent mistakes",
      why: "Repeated errors should be fixed before new topics.",
      priority: "HIGH" as const,
      minutes: 20,
      href: "mistakes",
    };
  }

  const dueTasks = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.workspaceId, params.workspaceId), eq(tasks.status, "pending")),
    )
    .orderBy(asc(tasks.dueDate))
    .limit(20);

  const interviewDrills = dueTasks.filter((t) => t.taskType === "interview_drill");
  if (interviewDrills[0]) {
    return {
      title: interviewDrills[0].title,
      why: "Post-mock interview remediation is high leverage close to interview day.",
      priority: "HIGH" as const,
      minutes: interviewDrills[0].estimatedMinutes ?? 20,
      href: "today",
      taskId: interviewDrills[0].id,
    };
  }

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
      href: "today",
      taskId: todays[0].id,
    };
  }

  if (!dueTasks.length) {
    return {
      title: "Generate your adaptive study plan",
      why: "Turn syllabus + weak areas into daily tasks.",
      priority: "HIGH" as const,
      minutes: 5,
      href: "plan",
    };
  }

  return {
    title: dueTasks[0]!.title,
    why: "Next pending task from your preparation plan.",
    priority: "MEDIUM" as const,
    minutes: dueTasks[0]!.estimatedMinutes ?? 25,
    href: "today",
    taskId: dueTasks[0]!.id,
  };
}
