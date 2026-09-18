import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureProfile, requireUser } from "@/lib/auth/session";
import { assertWithinDailyBudget } from "@/lib/analytics/usage";
import { rateLimit } from "@/lib/rate-limit";
import { discardAudioBuffer } from "@/lib/interview/audio-policy";
import {
  answerTurnTextInterview,
  answerTurnVoiceInterview,
  assertOwnedWorkspace,
  finishTurnVoiceInterview,
  startTurnVoiceInterview,
} from "@/lib/interview/turn-voice";

export const maxDuration = 60;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

const startSchema = z.object({
  workspaceId: z.string().uuid(),
  action: z.literal("start"),
  judgeMode: z.enum(["easy", "normal", "strict"]).optional(),
  language: z.enum(["en", "hi", "mix"]).optional(),
  recordingConsent: z.boolean().optional(),
  targetMinutes: z.number().int().min(5).max(20).optional(),
});

const textAnswerSchema = z.object({
  workspaceId: z.string().uuid(),
  action: z.literal("text_answer"),
  sessionId: z.string().uuid(),
  answer: z.string().min(1).max(4000),
});

const endSchema = z.object({
  workspaceId: z.string().uuid(),
  action: z.literal("end"),
  sessionId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return jsonError("Unauthorized", 401);
    await ensureProfile(user);

    const limited = await rateLimit({
      key: `voice-turn:${user.id}`,
      limit: 40,
      windowSeconds: 60 * 60,
    });
    if (!limited.allowed) {
      return jsonError("Voice drill rate limit exceeded", 429);
    }

    const contentType = request.headers.get("content-type") ?? "";

    // Multipart = candidate audio turn
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const workspaceId = String(form.get("workspaceId") ?? "");
      const sessionId = String(form.get("sessionId") ?? "");
      const language = String(form.get("language") ?? "en") as "en" | "hi" | "mix";
      const file = form.get("audio");

      if (!workspaceId || !sessionId) {
        return jsonError("workspaceId and sessionId required", 400);
      }
      if (!(file instanceof File)) {
        return jsonError("audio file required", 400);
      }
      if (file.size > 8 * 1024 * 1024) {
        return jsonError("Audio clip too large (max 8MB). Keep answers under ~90 seconds.", 400);
      }

      const workspace = await assertOwnedWorkspace(user.id, workspaceId);
      if (!workspace) return jsonError("Not found", 404);

      try {
        await assertWithinDailyBudget({ workspaceId, userId: user.id });
      } catch (error) {
        return jsonError(
          error instanceof Error ? error.message : "Budget exceeded",
          429,
        );
      }

      const bytes = Buffer.from(await file.arrayBuffer());
      try {
        const result = await answerTurnVoiceInterview({
          sessionId,
          workspaceId,
          userId: user.id,
          audio: bytes,
          filename: file.name || "answer.webm",
          mimeType: file.type || "audio/webm",
          language: ["en", "hi", "mix"].includes(language) ? language : "en",
        });
        discardAudioBuffer(bytes);
        return NextResponse.json(result);
      } catch (error) {
        discardAudioBuffer(bytes);
        return jsonError(
          error instanceof Error ? error.message : "Voice turn failed",
          400,
        );
      }
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    const startParsed = startSchema.safeParse(body);
    if (startParsed.success) {
      const workspace = await assertOwnedWorkspace(
        user.id,
        startParsed.data.workspaceId,
      );
      if (!workspace) return jsonError("Not found", 404);
      if (!startParsed.data.recordingConsent) {
        return jsonError("Recording consent is required for voice drills.", 400);
      }
      try {
        await assertWithinDailyBudget({
          workspaceId: startParsed.data.workspaceId,
          userId: user.id,
        });
      } catch (error) {
        return jsonError(
          error instanceof Error ? error.message : "Budget exceeded",
          429,
        );
      }

      const result = await startTurnVoiceInterview({
        workspaceId: startParsed.data.workspaceId,
        userId: user.id,
        judgeMode: startParsed.data.judgeMode,
        language: startParsed.data.language,
        targetMinutes: startParsed.data.targetMinutes,
        recordingConsent: true,
      });
      return NextResponse.json(result);
    }

    const textParsed = textAnswerSchema.safeParse(body);
    if (textParsed.success) {
      const workspace = await assertOwnedWorkspace(
        user.id,
        textParsed.data.workspaceId,
      );
      if (!workspace) return jsonError("Not found", 404);
      try {
        await assertWithinDailyBudget({
          workspaceId: textParsed.data.workspaceId,
          userId: user.id,
        });
      } catch (error) {
        return jsonError(
          error instanceof Error ? error.message : "Budget exceeded",
          429,
        );
      }
      try {
        const result = await answerTurnTextInterview({
          sessionId: textParsed.data.sessionId,
          workspaceId: textParsed.data.workspaceId,
          userId: user.id,
          answer: textParsed.data.answer,
        });
        return NextResponse.json(result);
      } catch (error) {
        return jsonError(
          error instanceof Error ? error.message : "Turn failed",
          400,
        );
      }
    }

    const endParsed = endSchema.safeParse(body);
    if (endParsed.success) {
      const workspace = await assertOwnedWorkspace(
        user.id,
        endParsed.data.workspaceId,
      );
      if (!workspace) return jsonError("Not found", 404);
      const result = await finishTurnVoiceInterview({
        sessionId: endParsed.data.sessionId,
        workspaceId: endParsed.data.workspaceId,
        userId: user.id,
      });
      return NextResponse.json(result);
    }

    return jsonError("Invalid request", 400);
  } catch (error) {
    console.error("interview.voice-turn", error);
    return jsonError(
      error instanceof Error ? error.message : "Voice drill failed",
      500,
    );
  }
}
