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
import { voiceInterviewSystem, type InterviewLanguage } from "@prompts";

function judgeVoiceInstructions(
  mode: JudgeMode,
  workspaceName: string,
  language: InterviewLanguage,
) {
  return voiceInterviewSystem(workspaceName, mode, language);
}

export async function startVoiceInterview(params: {
  workspaceId: string;
  userId: string;
  judgeMode?: JudgeMode;
  language?: InterviewLanguage;
  recordingConsent?: boolean;
}) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, params.workspaceId))
    .limit(1);
  if (!workspace) throw new Error("Workspace not found");

  const judgeMode = params.judgeMode ?? "normal";
  const language = params.language ?? "en";
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
        language,
        judgeMode,
        fillerCount: 0,
        candidateTurns: 0,
        interviewerTurns: 0,
        totalCandidateChars: 0,
      },
    })
    .returning();

  const ephemeral = await createRealtimeEphemeralSession({
    instructions: judgeVoiceInstructions(judgeMode, workspace.name, language),
    userId: params.userId,
    workspaceId: params.workspaceId,
  });

  return {
    session,
    realtime: ephemeral,
    language,
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
    const merged = {
      ...(session.speechMetrics ?? {}),
      ...params.speechMetrics,
    };
    await db
      .update(interviewSessions)
      .set({ speechMetrics: merged })
      .where(eq(interviewSessions.id, session.id));

    await db.insert(speechMetricsEvents).values({
      sessionId: session.id,
      workspaceId: params.workspaceId,
      metricType: "session_summary",
      value: Number(params.speechMetrics.fillerCount ?? 0),
      payload: merged,
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
