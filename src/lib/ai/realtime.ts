import { getOpenAI } from "./client";
import { MODELS } from "./models";
import { logAiUsage } from "./usage";

/** GA Realtime models (beta /v1/realtime/sessions is retired → 404 Invalid URL). */
function resolveVoiceModel() {
  const raw =
    process.env.VOICE_MODEL ||
    MODELS.voice ||
    "gpt-realtime-mini";
  // Always prefer mini for beta cost control unless explicitly set to a non-mini id.
  if (raw === "gpt-realtime" || raw === "gpt-realtime-2" || raw === "gpt-realtime-2.1") {
    return raw;
  }
  if (raw.includes("mini") || raw.includes("realtime")) {
    return "gpt-realtime-mini";
  }
  return "gpt-realtime-mini";
}

export async function createRealtimeEphemeralSession(params: {
  instructions: string;
  voice?: string;
  userId?: string | null;
  workspaceId?: string | null;
  /** Soft cap hint — client also auto-ends. */
  maxMinutes?: number;
}) {
  const openai = getOpenAI();
  const model = resolveVoiceModel();
  const voice = params.voice || "alloy";
  const maxMinutes = Math.min(Math.max(params.maxMinutes ?? 5, 3), 12);

  const created = await openai.realtime.clientSecrets.create({
    expires_after: {
      anchor: "created_at",
      // Secret TTL ≈ session window; don't mint long-lived keys.
      seconds: Math.min(60 + maxMinutes * 60, 900),
    },
    session: {
      type: "realtime",
      model: model as "gpt-realtime-mini",
      instructions: `${params.instructions}

COST DISCIPLINE: Keep answers short (2–4 sentences). Ask one question at a time. Do not monologue. Prefer silence over filler.`,
      output_modalities: ["audio"],
      // Cap how long each model reply can run (cuts audio-output tokens hard).
      max_output_tokens: 220,
      audio: {
        input: {
          // Cheaper than whisper-1 for input transcripts used in scorecards.
          transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: {
            type: "server_vad",
            threshold: 0.55,
            prefix_padding_ms: 200,
            // Longer silence → fewer turns → far less audio-out spend.
            silence_duration_ms: 900,
            create_response: true,
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
    // Rough planning estimate so daily voice budget actually gates (OpenAI bills by audio tokens).
    inputTokens: Math.round(maxMinutes * 600),
    outputTokens: Math.round(maxMinutes * 400),
    cached: false,
    metadata: {
      expiresAt: created.expires_at,
      maxMinutes,
      estimateNote: "pre-charge estimate for budget gate; actual OpenAI invoice may differ",
    },
  });

  return {
    model,
    sessionId: null,
    clientSecret: created.value,
    expiresAt: created.expires_at,
    maxMinutes,
  };
}
