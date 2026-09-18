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
import { retrieveRelevantChunks } from "@/lib/rag/retrieve";
import {
  interviewChecklistSystem,
  interviewEvalSystem,
  interviewFollowupSystem,
  textInterviewSystem,
} from "@prompts";

export type JudgeMode = "easy" | "normal" | "strict";

function judgeInstructions(mode: JudgeMode) {
  if (mode === "easy") {
    return "Be encouraging. Ask clear questions. Give supportive follow-ups. Score generously but honestly.";
  }
  if (mode === "strict") {
    return "Be a demanding KVS panelist. Probe depth, examples, and pedagogy precision. Interrupt vague answers with sharp follow-ups. Score strictly.";
  }
  return "Be a realistic KVS PRT interview panel. Ask one question at a time, then a relevant follow-up. Score fairly.";
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
}) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, params.workspaceId))
    .limit(1);
  if (!workspace) throw new Error("Workspace not found");

  const judgeMode = params.judgeMode ?? "normal";
  const [session] = await db
    .insert(interviewSessions)
    .values({
      workspaceId: params.workspaceId,
      userId: params.userId,
      mode: "text",
      judgeMode,
      status: "active",
      targetMinutes: params.targetMinutes ?? 20,
    })
    .returning();

  const contextChunks = await retrieveRelevantChunks({
    workspaceId: params.workspaceId,
    query: "KVS PRT interview introduction pedagogy documents",
    userId: params.userId,
    limit: 4,
  });

  const opener = await chatCompletion({
    model: MODELS.fast,
    system: `${textInterviewSystem(workspace.name, judgeMode)}
${judgeInstructions(judgeMode)}`,
    user: `Candidate role: ${workspace.role ?? "PRT"}
Org: ${workspace.organization ?? "KVS"}
Context excerpts (may be empty):
${contextChunks.map((c) => c.content).join("\n").slice(0, 3000)}`,
    userId: params.userId,
    workspaceId: params.workspaceId,
    feature: "interview_start",
    useCache: false,
  });

  await db.insert(interviewTurns).values({
    sessionId: session.id,
    turnIndex: 0,
    role: "interviewer",
    content: opener.content,
  });

  return { session, openingQuestion: opener.content };
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

  const transcript = [...turns, { role: "candidate", content: params.answer }]
    .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
    .join("\n");

  const elapsedTurns = turns.filter((t) => t.role === "interviewer").length + 1;
  const shouldSuggestEnd = elapsedTurns >= 6;

  const result = await chatCompletion({
    model: MODELS.fast,
    system: `${interviewFollowupSystem(session.judgeMode)}
${judgeInstructions(session.judgeMode as JudgeMode)}`,
    user: `Turn count (interviewer asks so far): ${elapsedTurns}
Suggest end soon: ${shouldSuggestEnd}
TRANSCRIPT:
${transcript.slice(0, 12000)}`,
    userId: params.userId,
    workspaceId: params.workspaceId,
    feature: "interview_turn",
    useCache: false,
    temperature: 0.3,
  });

  let parsed = turnSchema.safeParse({
    interviewerMessage: result.content,
    score: 6,
    feedback: "Continue with a clearer example.",
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
        interviewerMessage: "Thank you. Can you give a classroom example to support that?",
        score: 6,
        feedback: "Add a concrete teaching example.",
        shouldEnd: false,
      };

  await db
    .update(interviewTurns)
    .set({
      score: data.score ?? null,
      feedback: data.feedback ?? null,
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
      content: data.interviewerMessage,
      metadata: { isFollowUp: data.isFollowUp ?? false },
    })
    .returning();

  return {
    interviewerTurn,
    score: data.score ?? null,
    feedback: data.feedback ?? null,
    shouldEnd: Boolean(data.shouldEnd) || shouldSuggestEnd,
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

  let report = {
    overallScore: 6,
    summary: "Session completed. Review transcript and practice clearer examples.",
    strengths: ["Completed the mock"],
    weaknesses: ["Needs more concrete classroom examples"],
    improvedAnswers: [] as Array<{ prompt: string; original: string; improved: string }>,
    drills: ["Practice a 2-minute demo explanation on one PRT topic"],
  };

  try {
    const match = result.content.match(/\{[\s\S]*\}/);
    const safe = reportSchema.safeParse(JSON.parse(match ? match[0] : "{}"));
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
