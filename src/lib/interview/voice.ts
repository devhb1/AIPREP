import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  interviewSessions,
  interviewTurns,
  speechMetricsEvents,
  workspaces,
} from "@/lib/db/schema";
import { createRealtimeEphemeralSession } from "@/lib/ai/realtime";
import { endInterviewSession, type JudgeMode } from "@/lib/interview/session";

function judgeVoiceInstructions(mode: JudgeMode, workspaceName: string) {
  const base = `You are conducting a live voice mock interview for ${workspaceName} (KVS PRT style).
Speak clearly and briefly. Ask one question at a time. Wait for the candidate to finish.
Never invent private panelist personal data. Prefer pedagogy, classroom examples, and document readiness topics.`;
  if (mode === "easy") {
    return `${base} Be warm and encouraging. Soft follow-ups.`;
  }
  if (mode === "strict") {
    return `${base} Be demanding. Probe vague answers immediately with sharp follow-ups.`;
  }
  return `${base} Be realistic and professional.`;
}

export async function startVoiceInterview(params: {
  workspaceId: string;
  userId: string;
  judgeMode?: JudgeMode;
  recordingConsent?: boolean;
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
      mode: "voice",
      judgeMode,
      status: "active",
      targetMinutes: 20,
      recordingConsent: Boolean(params.recordingConsent),
      speechMetrics: {
        fillerCount: 0,
        candidateTurns: 0,
        interviewerTurns: 0,
        totalCandidateChars: 0,
      },
    })
    .returning();

  const ephemeral = await createRealtimeEphemeralSession({
    instructions: judgeVoiceInstructions(judgeMode, workspace.name),
    userId: params.userId,
    workspaceId: params.workspaceId,
  });

  return {
    session,
    realtime: ephemeral,
  };
}

export async function persistVoiceTranscript(params: {
  sessionId: string;
  workspaceId: string;
  userId: string;
  turns: Array<{ role: "interviewer" | "candidate"; content: string }>;
  speechMetrics?: Record<string, unknown>;
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

  // Replace existing turns for this voice session snapshot
  await db.delete(interviewTurns).where(eq(interviewTurns.sessionId, session.id));

  if (params.turns.length) {
    await db.insert(interviewTurns).values(
      params.turns.map((turn, index) => ({
        sessionId: session.id,
        turnIndex: index,
        role: turn.role,
        content: turn.content,
      })),
    );
  }

  if (params.speechMetrics) {
    await db
      .update(interviewSessions)
      .set({ speechMetrics: params.speechMetrics })
      .where(eq(interviewSessions.id, session.id));

    await db.insert(speechMetricsEvents).values({
      sessionId: session.id,
      workspaceId: params.workspaceId,
      metricType: "session_summary",
      value: Number(params.speechMetrics.fillerCount ?? 0),
      payload: params.speechMetrics,
    });
  }

  return { ok: true };
}

export async function finishVoiceInterview(params: {
  sessionId: string;
  workspaceId: string;
  userId: string;
  turns: Array<{ role: "interviewer" | "candidate"; content: string }>;
  speechMetrics?: Record<string, unknown>;
}) {
  await persistVoiceTranscript(params);
  return endInterviewSession({
    sessionId: params.sessionId,
    workspaceId: params.workspaceId,
    userId: params.userId,
  });
}
