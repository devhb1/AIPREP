import { getOpenAI } from "./client";
import { MODELS } from "./models";
import { logAiUsage } from "./usage";

export async function createRealtimeEphemeralSession(params: {
  instructions: string;
  voice?: string;
  userId?: string | null;
  workspaceId?: string | null;
}) {
  const openai = getOpenAI();
  const model =
    process.env.VOICE_MODEL ||
    MODELS.voice ||
    "gpt-4o-mini-realtime-preview";

  const session = await openai.beta.realtime.sessions.create({
    model: model as
      | "gpt-4o-mini-realtime-preview"
      | "gpt-4o-realtime-preview",
    modalities: ["audio", "text"],
    instructions: params.instructions,
    voice: (params.voice as "alloy" | "ash" | "ballad" | "coral" | "echo" | "sage" | "shimmer" | "verse") || "alloy",
    input_audio_transcription: {
      model: "whisper-1",
    },
    turn_detection: {
      type: "server_vad",
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 600,
    },
  });

  await logAiUsage({
    userId: params.userId,
    workspaceId: params.workspaceId,
    feature: "realtime_session_create",
    model,
    inputTokens: 0,
    outputTokens: 0,
    cached: false,
    metadata: {
      expiresAt: session.client_secret.expires_at,
    },
  });

  return {
    model,
    sessionId: null,
    clientSecret: session.client_secret.value,
    expiresAt: session.client_secret.expires_at,
  };
}
