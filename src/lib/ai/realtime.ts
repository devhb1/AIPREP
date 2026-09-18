import { getOpenAI } from "./client";
import { MODELS } from "./models";
import { logAiUsage } from "./usage";

/** GA Realtime models (beta /v1/realtime/sessions is retired → 404 Invalid URL). */
function resolveVoiceModel() {
  const raw =
    process.env.VOICE_MODEL ||
    MODELS.voice ||
    "gpt-realtime-mini";
  // Map retired preview names still common in env to GA equivalents.
  if (raw.includes("mini") && raw.includes("realtime")) {
    return "gpt-realtime-mini";
  }
  if (raw.includes("realtime")) {
    return "gpt-realtime";
  }
  return raw;
}

export async function createRealtimeEphemeralSession(params: {
  instructions: string;
  voice?: string;
  userId?: string | null;
  workspaceId?: string | null;
}) {
  const openai = getOpenAI();
  const model = resolveVoiceModel();
  const voice = params.voice || "alloy";

  const created = await openai.realtime.clientSecrets.create({
    expires_after: { anchor: "created_at", seconds: 600 },
    session: {
      type: "realtime",
      model: model as "gpt-realtime-mini",
      instructions: params.instructions,
      output_modalities: ["audio"],
      audio: {
        input: {
          transcription: { model: "whisper-1" },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 600,
          },
        },
        output: { voice },
      },
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
      expiresAt: created.expires_at,
    },
  });

  return {
    model,
    sessionId: null,
    clientSecret: created.value,
    expiresAt: created.expires_at,
  };
}
