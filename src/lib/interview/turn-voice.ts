import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { interviewSessions, workspaces } from "@/lib/db/schema";
import {
  ttsVoiceForPersona,
} from "@/lib/interview/personas";
import { synthesizeSpeech, transcribeAudio } from "@/lib/ai/speech";
import {
  answerInterviewTurn,
  endInterviewSession,
  startInterviewSession,
  type JudgeMode,
} from "@/lib/interview/session";
import type { InterviewLanguage } from "@prompts";

export async function startTurnVoiceInterview(params: {
  workspaceId: string;
  userId: string;
  judgeMode?: JudgeMode;
  language?: InterviewLanguage;
  targetMinutes?: number;
  recordingConsent?: boolean;
}) {
  const language = params.language ?? "en";
  const started = await startInterviewSession({
    workspaceId: params.workspaceId,
    userId: params.userId,
    judgeMode: params.judgeMode,
    targetMinutes: params.targetMinutes ?? 10,
    mode: "voice",
    language,
  });

  if (params.recordingConsent != null) {
    const metrics = (started.session.speechMetrics ?? {}) as Record<string, unknown>;
    await db
      .update(interviewSessions)
      .set({
        recordingConsent: Boolean(params.recordingConsent),
        speechMetrics: {
          ...metrics,
          language,
          engine: "turn_based",
          judgeMode: params.judgeMode ?? "normal",
        },
      })
      .where(eq(interviewSessions.id, started.session.id));
  }

  // Skip TTS on start — text-first avoids Vercel timeouts. Client can speak later.
  return {
    session: { ...started.session, mode: "voice" as const },
    openingQuestion: started.openingQuestion,
    audioBase64: "",
    audioMimeType: "audio/mpeg",
    language,
    engine: "turn_based" as const,
    persona: started.persona,
    personaLabel: started.personaLabel,
  };
}

export async function answerTurnVoiceInterview(params: {
  sessionId: string;
  workspaceId: string;
  userId: string;
  audio: Buffer;
  filename: string;
  mimeType?: string;
  language?: InterviewLanguage;
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

  const stt = await transcribeAudio({
    bytes: params.audio,
    filename: params.filename,
    mimeType: params.mimeType,
    language: params.language ?? "en",
    userId: params.userId,
    workspaceId: params.workspaceId,
  });

  if (stt.text.length < 2) {
    throw new Error("Could not hear a clear answer — hold longer and speak closer to the mic.");
  }

  const turn = await answerInterviewTurn({
    sessionId: params.sessionId,
    workspaceId: params.workspaceId,
    userId: params.userId,
    answer: stt.text,
  });

  // Best-effort TTS — never block the turn on speech synthesis.
  let audioBase64 = "";
  let audioMimeType = "audio/mpeg";
  try {
    const speech = await Promise.race([
      synthesizeSpeech({
        text: turn.interviewerTurn.content,
        voice: ttsVoiceForPersona(turn.persona),
        userId: params.userId,
        workspaceId: params.workspaceId,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
    ]);
    if (speech) {
      audioBase64 = speech.audioBase64;
      audioMimeType = speech.mimeType;
    }
  } catch {
    // text-only turn is valid
  }

  return {
    transcript: stt.text,
    interviewerMessage: turn.interviewerTurn.content,
    interviewerTurn: turn.interviewerTurn,
    score: turn.score,
    feedback: turn.feedback,
    shouldEnd: turn.shouldEnd,
    persona: turn.persona,
    personaLabel: turn.personaLabel,
    audioBase64,
    audioMimeType,
  };
}

export async function answerTurnTextInterview(params: {
  sessionId: string;
  workspaceId: string;
  userId: string;
  answer: string;
}) {
  const turn = await answerInterviewTurn({
    sessionId: params.sessionId,
    workspaceId: params.workspaceId,
    userId: params.userId,
    answer: params.answer,
  });

  // Best-effort TTS — never block the turn on speech synthesis.
  let audioBase64 = "";
  let audioMimeType = "audio/mpeg";
  try {
    const speech = await Promise.race([
      synthesizeSpeech({
        text: turn.interviewerTurn.content,
        voice: ttsVoiceForPersona(turn.persona),
        userId: params.userId,
        workspaceId: params.workspaceId,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
    ]);
    if (speech) {
      audioBase64 = speech.audioBase64;
      audioMimeType = speech.mimeType;
    }
  } catch {
    // text-only turn is valid
  }

  return {
    transcript: params.answer,
    interviewerMessage: turn.interviewerTurn.content,
    interviewerTurn: turn.interviewerTurn,
    score: turn.score,
    feedback: turn.feedback,
    shouldEnd: turn.shouldEnd,
    persona: turn.persona,
    personaLabel: turn.personaLabel,
    audioBase64,
    audioMimeType,
  };
}

export async function finishTurnVoiceInterview(params: {
  sessionId: string;
  workspaceId: string;
  userId: string;
}) {
  return endInterviewSession(params);
}

export async function assertOwnedWorkspace(userId: string, workspaceId: string) {
  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)))
    .limit(1);
  return workspace ?? null;
}
