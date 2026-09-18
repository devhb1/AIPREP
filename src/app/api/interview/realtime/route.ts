import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { ensureProfile, requireUser } from "@/lib/auth/session";
import {
  finishVoiceInterview,
  persistVoiceTranscript,
  startVoiceInterview,
} from "@/lib/interview/voice";
import { rateLimit } from "@/lib/rate-limit";
import { assertWithinVoiceBudget } from "@/lib/analytics/usage";

export const maxDuration = 60;

async function assertWorkspace(userId: string, workspaceId: string) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)))
    .limit(1);
  return workspace ?? null;
}

const bodySchema = z.object({
  workspaceId: z.string().uuid(),
  action: z.enum(["start", "persist", "finish"]),
  sessionId: z.string().uuid().optional(),
  judgeMode: z.enum(["easy", "normal", "strict"]).optional(),
  language: z.enum(["en", "hi", "mix"]).optional(),
  recordingConsent: z.boolean().optional(),
  targetMinutes: z.number().int().min(3).max(12).optional(),
  turns: z
    .array(
      z.object({
        role: z.enum(["interviewer", "candidate"]),
        content: z.string().min(1),
      }),
    )
    .optional(),
  speechMetrics: z.record(z.string(), z.unknown()).optional(),
});

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return jsonError("Unauthorized", 401);

    try {
      await ensureProfile(user);
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : "Profile setup failed",
        500,
      );
    }

    const limited = await rateLimit({
      key: `voice:${user.id}`,
      limit: 10,
      windowSeconds: 60 * 60,
    });
    if (!limited.allowed) {
      return jsonError("Voice interview rate limit exceeded", 429);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const workspace = await assertWorkspace(user.id, parsed.data.workspaceId);
    if (!workspace) return jsonError("Not found", 404);

    if (parsed.data.action === "start") {
      if (!parsed.data.recordingConsent) {
        return jsonError(
          "Recording/transcript consent is required for voice mocks.",
          400,
        );
      }
      try {
        await assertWithinVoiceBudget({
          workspaceId: parsed.data.workspaceId,
          userId: user.id,
        });
      } catch (error) {
        return jsonError(
          error instanceof Error ? error.message : "Budget exceeded",
          429,
        );
      }
      try {
        const result = await startVoiceInterview({
          workspaceId: parsed.data.workspaceId,
          userId: user.id,
          judgeMode: parsed.data.judgeMode,
          language: parsed.data.language,
          recordingConsent: true,
          targetMinutes: parsed.data.targetMinutes,
        });
        return NextResponse.json(result);
      } catch (error) {
        return jsonError(
          error instanceof Error
            ? error.message
            : "Failed to create realtime session. Check VOICE_MODEL / OpenAI realtime access.",
          500,
        );
      }
    }

    if (!parsed.data.sessionId || !parsed.data.turns) {
      return jsonError("sessionId and turns are required", 400);
    }

    if (parsed.data.action === "persist") {
      const result = await persistVoiceTranscript({
        sessionId: parsed.data.sessionId,
        workspaceId: parsed.data.workspaceId,
        userId: user.id,
        turns: parsed.data.turns,
        speechMetrics: parsed.data.speechMetrics,
      });
      return NextResponse.json(result);
    }

    const result = await finishVoiceInterview({
      sessionId: parsed.data.sessionId,
      workspaceId: parsed.data.workspaceId,
      userId: user.id,
      turns: parsed.data.turns,
      speechMetrics: parsed.data.speechMetrics,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("interview.realtime", error);
    return jsonError(
      error instanceof Error ? error.message : "Voice route failed",
      500,
    );
  }
}
