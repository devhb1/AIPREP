import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  interviewAnswersLibrary,
  interviewChecklists,
  interviewSessions,
  interviewTurns,
  memoryItems,
  personalStories,
  tasks,
  workspaces,
} from "@/lib/db/schema";
import { chatCompletion } from "@/lib/ai/responses";
import { MODELS } from "@/lib/ai/models";
import {
  interviewChecklistSystem,
  interviewEvalSystem,
  interviewFollowupSystem,
  type InterviewLanguage,
} from "@prompts";
import {
  PERSONAS,
  maxCandidateTurns,
  panelCloser,
  panelOpener,
  personaAfterCandidateTurns,
  type PersonaKey,
} from "@/lib/interview/personas";
import { invalidateNba } from "@/lib/cache/ai-cache";

export type JudgeMode = "easy" | "normal" | "strict";

/** Hard cap on follow-up tokens (Appendix B / §9). */
export const INTERVIEW_TURN_MAX_TOKENS = 140;

function judgeInstructions(mode: JudgeMode) {
  if (mode === "easy") {
    return "Be encouraging. Ask clear questions. Give supportive follow-ups. Score generously but honestly.";
  }
  if (mode === "strict") {
    return "Be a demanding teaching-panel interviewer. Probe depth, examples, and pedagogy precision. Interrupt vague answers with sharp follow-ups. Score strictly.";
  }
  return "Be a realistic primary teaching interview panel. Ask one question at a time, then a relevant follow-up. Score fairly.";
}

const turnSchema = z.object({
  interviewerMessage: z.string(),
  isFollowUp: z.boolean().optional(),
  score: z.number().min(0).max(10).optional(),
  feedback: z.string().optional(),
  shouldEnd: z.boolean().optional(),
});

const reportSchema = z.object({
  overallScore: z.number().min(0).max(10),
  dimensions: z
    .object({
      content: z.number().min(0).max(10).optional(),
      structure: z.number().min(0).max(10).optional(),
      communication: z.number().min(0).max(10).optional(),
      speech: z.number().min(0).max(10).nullable().optional(),
    })
    .optional(),
  summary: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  improvedAnswers: z.array(
    z.object({
      prompt: z.string(),
      original: z.string(),
      improved: z.string(),
    }),
  ),
  drills: z.array(z.string()),
  focusRecommendations: z
    .array(
      z.object({
        topic: z.string(),
        reason: z.string(),
        suggestedAction: z.string(),
        urgencyDays: z.number().optional(),
      }),
    )
    .optional(),
});

export async function ensureInterviewChecklist(params: {
  workspaceId: string;
  userId: string;
  useAi?: boolean;
}) {
  const existing = await db
    .select()
    .from(interviewChecklists)
    .where(eq(interviewChecklists.workspaceId, params.workspaceId))
    .limit(1);
  if (existing[0]) return existing[0];

  const trusted = await db
    .select()
    .from(memoryItems)
    .where(
      and(
        eq(memoryItems.workspaceId, params.workspaceId),
        eq(memoryItems.namespace, "trusted"),
      ),
    )
    .limit(20);

  const evidence = trusted.map((m) => m.content).join("\n");
  // Fast path for page load: defaults only (no OpenAI). AI refresh via action=checklist.
  const defaults = [
    "Original certificates and photocopies",
    "Photo ID / Aadhaar",
    "Educational marksheets",
    "CTET / eligibility documents if applicable",
    "Experience certificates",
    "Passport photos",
    "Application / admit / call letter",
    "Teaching demo notes (if required)",
  ];

  let items = defaults.map((label, i) => ({
    id: `item-${i + 1}`,
    label,
    done: false,
  }));

  if (params.useAi && evidence.trim()) {
    const result = await chatCompletion({
      model: MODELS.fast,
      system: interviewChecklistSystem,
      user: `Evidence:\n${evidence.slice(0, 8000)}`,
      userId: params.userId,
      workspaceId: params.workspaceId,
      feature: "interview_checklist",
      useCache: false,
      temperature: 0,
    });
    try {
      const match = result.content.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : "{}") as { items?: string[] };
      if (parsed.items?.length) {
        items = parsed.items.slice(0, 12).map((label, i) => ({
          id: `item-${i + 1}`,
          label,
          done: false,
        }));
      }
    } catch {
      // keep defaults
    }
  }

  const [row] = await db
    .insert(interviewChecklists)
    .values({
      workspaceId: params.workspaceId,
      title: "Interview / Exam Day Checklist",
      items,
    })
    .returning();
  return row;
}

export async function startInterviewSession(params: {
  workspaceId: string;
  userId: string;
  judgeMode?: JudgeMode;
  targetMinutes?: number;
  mode?: "text" | "voice";
  language?: InterviewLanguage;
}) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, params.workspaceId))
    .limit(1);
  if (!workspace) throw new Error("Workspace not found");

  const judgeMode = params.judgeMode ?? "normal";
  const language = params.language ?? "en";
  const targetMinutes = params.targetMinutes ?? 10;
  const openingQuestion = panelOpener(language);

  const [session] = await db
    .insert(interviewSessions)
    .values({
      workspaceId: params.workspaceId,
      userId: params.userId,
      mode: params.mode ?? "text",
      judgeMode,
      status: "active",
      targetMinutes,
      speechMetrics: {
        language,
        persona: "hr" as PersonaKey,
        engine: params.mode === "voice" ? "turn_based" : "text",
        judgeMode,
        candidateTurns: 0,
        maxCandidateTurns: maxCandidateTurns(targetMinutes),
      },
    })
    .returning();

  await db.insert(interviewTurns).values({
    sessionId: session.id,
    turnIndex: 0,
    role: "interviewer",
    content: openingQuestion,
    metadata: { persona: "hr", hardcoded: true },
  });

  return {
    session,
    openingQuestion,
    persona: "hr" as PersonaKey,
    personaLabel: PERSONAS.hr.label,
  };
}

export async function answerInterviewTurn(params: {
  sessionId: string;
  workspaceId: string;
  userId: string;
  answer: string;
}) {
  const [session] = await db
    .select()
    .from(interviewSessions)
    .where(
      and(
        eq(interviewSessions.id, params.sessionId),
        eq(interviewSessions.workspaceId, params.workspaceId),
        eq(interviewSessions.userId, params.userId),
      ),
    )
    .limit(1);
  if (!session) throw new Error("Session not found");
  if (session.status !== "active") throw new Error("Session already ended");

  const turns = await db
    .select()
    .from(interviewTurns)
    .where(eq(interviewTurns.sessionId, session.id))
    .orderBy(asc(interviewTurns.turnIndex));

  const nextIndex = turns.length;
  await db.insert(interviewTurns).values({
    sessionId: session.id,
    turnIndex: nextIndex,
    role: "candidate",
    content: params.answer,
  });

  const metrics = (session.speechMetrics ?? {}) as Record<string, unknown>;
  const language = (
    metrics.language === "hi" || metrics.language === "mix" ? metrics.language : "en"
  ) as InterviewLanguage;
  const candidateTurns =
    turns.filter((t) => t.role === "candidate").length + 1;
  const cap =
    typeof metrics.maxCandidateTurns === "number"
      ? metrics.maxCandidateTurns
      : maxCandidateTurns(session.targetMinutes);
  const closeNow = candidateTurns >= cap;

  let persona: PersonaKey = closeNow ? "hr" : personaAfterCandidateTurns(candidateTurns);
  let interviewerMessage = panelCloser(language);
  let score: number | null = null;
  let feedback: string | null = closeNow ? "Session wrapping up." : null;
  let shouldEnd = closeNow;

  if (!closeNow) {
    const recent = [...turns, { role: "candidate", content: params.answer }].slice(-6);
    const transcript = recent
      .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
      .join("\n");

    const result = await chatCompletion({
      model: MODELS.fast,
      system: `${interviewFollowupSystem(session.judgeMode, PERSONAS[persona].fragment)}
${judgeInstructions(session.judgeMode as JudgeMode)}`,
      user: `Candidate answers so far: ${candidateTurns}/${cap}
Recent turns only:
${transcript.slice(0, 3500)}`,
      userId: params.userId,
      workspaceId: params.workspaceId,
      feature: "interview_turn",
      useCache: false,
      temperature: 0.3,
      maxTokens: INTERVIEW_TURN_MAX_TOKENS,
    });

    let parsed = turnSchema.safeParse({
      interviewerMessage: result.content,
      score: 6,
      feedback: "Give a classroom example.",
    });
    try {
      const match = result.content.match(/\{[\s\S]*\}/);
      const json = JSON.parse(match ? match[0] : "{}");
      const safe = turnSchema.safeParse(json);
      if (safe.success) parsed = safe;
    } catch {
      // fallback already set
    }

    const data = parsed.success
      ? parsed.data
      : {
          interviewerMessage:
            "Thank you. Can you give a classroom example to support that?",
          score: 6,
          feedback: "Add a concrete teaching example.",
          shouldEnd: false,
        };

    interviewerMessage = data.interviewerMessage.slice(0, 320);
    score = data.score ?? null;
    feedback = data.feedback ?? null;
    shouldEnd = Boolean(data.shouldEnd) || candidateTurns >= cap - 1;
    if (shouldEnd) {
      interviewerMessage = panelCloser(language);
      persona = "hr";
    }
  }

  await db
    .update(interviewTurns)
    .set({
      score,
      feedback,
    })
    .where(
      and(
        eq(interviewTurns.sessionId, session.id),
        eq(interviewTurns.turnIndex, nextIndex),
      ),
    );

  const [interviewerTurn] = await db
    .insert(interviewTurns)
    .values({
      sessionId: session.id,
      turnIndex: nextIndex + 1,
      role: "interviewer",
      content: interviewerMessage,
      metadata: { persona, hardcoded: closeNow || shouldEnd },
    })
    .returning();

  await db
    .update(interviewSessions)
    .set({
      speechMetrics: {
        ...metrics,
        language,
        persona,
        candidateTurns,
      },
    })
    .where(eq(interviewSessions.id, session.id));

  return {
    interviewerTurn,
    score,
    feedback,
    shouldEnd,
    persona,
    personaLabel: PERSONAS[persona].label,
  };
}

export async function endInterviewSession(params: {
  sessionId: string;
  workspaceId: string;
  userId: string;
}) {
  const [session] = await db
    .select()
    .from(interviewSessions)
    .where(
      and(
        eq(interviewSessions.id, params.sessionId),
        eq(interviewSessions.workspaceId, params.workspaceId),
        eq(interviewSessions.userId, params.userId),
      ),
    )
    .limit(1);
  if (!session) throw new Error("Session not found");

  const turns = await db
    .select()
    .from(interviewTurns)
    .where(eq(interviewTurns.sessionId, session.id))
    .orderBy(asc(interviewTurns.turnIndex));

  const transcript = turns
    .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
    .join("\n");

  const result = await chatCompletion({
    model: MODELS.fast,
    system: interviewEvalSystem,
    user: `Judge mode: ${session.judgeMode}\n\nTRANSCRIPT:\n${transcript.slice(0, 14000)}`,
    userId: params.userId,
    workspaceId: params.workspaceId,
    feature: "interview_evaluate",
    useCache: false,
    temperature: 0.2,
  });

  let report: z.infer<typeof reportSchema> = {
    overallScore: 6,
    dimensions: {
      content: 6,
      structure: 6,
      communication: 6,
      speech: session.mode === "voice" ? 6 : null,
    },
    summary: "Session completed. Review transcript and practice clearer examples.",
    strengths: ["Completed the mock"],
    weaknesses: ["Needs more concrete classroom examples"],
    improvedAnswers: [] as Array<{ prompt: string; original: string; improved: string }>,
    drills: ["Practice a 2-minute demo explanation on one PRT topic"],
    focusRecommendations: [
      {
        topic: "Classroom examples",
        reason: "Answers stayed general.",
        suggestedAction: "Prepare two STAR stories from a real classroom.",
        urgencyDays: 3,
      },
    ],
  };

  try {
    const match = result.content.match(/\{[\s\S]*\}/);
    const raw = JSON.parse(match ? match[0] : "{}") as Record<string, unknown>;
    if (!raw.focusRecommendations && Array.isArray(raw.focus_recommendations)) {
      raw.focusRecommendations = (raw.focus_recommendations as Array<Record<string, unknown>>).map(
        (row) => ({
          topic: row.topic,
          reason: row.reason,
          suggestedAction: row.suggestedAction ?? row.suggested_action,
          urgencyDays: row.urgencyDays ?? row.urgency_days,
        }),
      );
    }
    const safe = reportSchema.safeParse(raw);
    if (safe.success) report = safe.data;
  } catch {
    // fallback
  }

  const [updated] = await db
    .update(interviewSessions)
    .set({
      status: "completed",
      endedAt: new Date(),
      overallScore: report.overallScore,
      summary: report.summary,
      report,
    })
    .where(eq(interviewSessions.id, session.id))
    .returning();

  for (const item of report.improvedAnswers.slice(0, 5)) {
    await db.insert(interviewAnswersLibrary).values({
      workspaceId: params.workspaceId,
      userId: params.userId,
      prompt: item.prompt,
      answer: item.original,
      improvedAnswer: item.improved,
      tags: ["mock", session.judgeMode],
      sourceSessionId: session.id,
    });
  }

  for (const rec of (report.focusRecommendations ?? []).slice(0, 3)) {
    await db.insert(tasks).values({
      workspaceId: params.workspaceId,
      title: rec.suggestedAction.slice(0, 80),
      description: `${rec.topic}: ${rec.reason}`,
      taskType: "interview_drill",
      status: "pending",
      priority: "high",
      estimatedMinutes: 20,
      dueDate: new Date(),
      metadata: { source: "focus_recommendation", urgencyDays: rec.urgencyDays },
    });
  }

  for (const drill of report.drills.slice(0, 4)) {
    await db.insert(tasks).values({
      workspaceId: params.workspaceId,
      title: `Interview drill: ${drill.slice(0, 80)}`,
      description: drill,
      taskType: "interview_drill",
      status: "pending",
      priority: "high",
      estimatedMinutes: 20,
      dueDate: new Date(),
    });
  }

  await invalidateNba(params.workspaceId);

  return { session: updated, report, turns };
}

export async function listInterviewSessions(workspaceId: string) {
  return db
    .select()
    .from(interviewSessions)
    .where(eq(interviewSessions.workspaceId, workspaceId))
    .orderBy(desc(interviewSessions.createdAt));
}

export async function getInterviewSession(params: {
  sessionId: string;
  workspaceId: string;
  userId: string;
}) {
  const [session] = await db
    .select()
    .from(interviewSessions)
    .where(
      and(
        eq(interviewSessions.id, params.sessionId),
        eq(interviewSessions.workspaceId, params.workspaceId),
        eq(interviewSessions.userId, params.userId),
      ),
    )
    .limit(1);
  if (!session) return null;
  const turns = await db
    .select()
    .from(interviewTurns)
    .where(eq(interviewTurns.sessionId, session.id))
    .orderBy(asc(interviewTurns.turnIndex));
  return { session, turns };
}

export async function listAnswerLibrary(workspaceId: string) {
  return db
    .select()
    .from(interviewAnswersLibrary)
    .where(eq(interviewAnswersLibrary.workspaceId, workspaceId))
    .orderBy(desc(interviewAnswersLibrary.createdAt));
}

export async function addPersonalStory(params: {
  workspaceId: string;
  userId: string;
  title: string;
  content: string;
  tags?: string[];
}) {
  const [row] = await db
    .insert(personalStories)
    .values({
      workspaceId: params.workspaceId,
      userId: params.userId,
      title: params.title,
      content: params.content,
      tags: params.tags ?? [],
    })
    .returning();
  return row;
}

export async function listPersonalStories(workspaceId: string) {
  return db
    .select()
    .from(personalStories)
    .where(eq(personalStories.workspaceId, workspaceId))
    .orderBy(desc(personalStories.createdAt));
}
