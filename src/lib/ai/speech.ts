import { toFile } from "openai";
import { getOpenAI } from "./client";
import { logAiUsage } from "./usage";

const STT_MODEL = process.env.STT_MODEL || "gpt-4o-mini-transcribe";
const STT_FALLBACK = process.env.STT_FALLBACK_MODEL || "whisper-1";
/** Classic tts-1 is the cheapest reliable TTS for short interviewer lines. */
const TTS_MODEL = process.env.TTS_MODEL || "tts-1";

function normalizeMime(raw?: string) {
  const base = (raw || "audio/wav").split(";")[0].trim().toLowerCase();
  if (base === "audio/mp4" || base === "video/mp4" || base === "audio/m4a") return "audio/mp4";
  if (base === "audio/x-wav" || base === "audio/wave") return "audio/wav";
  return base || "audio/wav";
}

function filenameFor(mime: string, given?: string) {
  if (given && /\.(wav|webm|m4a|mp3|mp4|ogg|mpeg)$/i.test(given)) return given;
  if (mime.includes("wav")) return "answer.wav";
  if (mime.includes("mp4") || mime.includes("m4a")) return "answer.m4a";
  if (mime.includes("ogg")) return "answer.ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "answer.mp3";
  return "answer.webm";
}

async function runTranscription(params: {
  bytes: Buffer;
  filename: string;
  mime: string;
  language?: string;
  model: string;
}) {
  const openai = getOpenAI();
  const file = await toFile(params.bytes, params.filename, { type: params.mime });
  return openai.audio.transcriptions.create({
    file,
    model: params.model,
    ...(params.language ? { language: params.language } : {}),
  });
}

export async function transcribeAudio(params: {
  bytes: Buffer;
  filename: string;
  mimeType?: string;
  language?: "en" | "hi" | "mix";
  userId?: string | null;
  workspaceId?: string | null;
}) {
  if (!params.bytes?.length || params.bytes.length < 44) {
    throw new Error("Recording too short — speak for at least 2 seconds, then send.");
  }

  const mime = normalizeMime(params.mimeType);
  const filename = filenameFor(mime, params.filename);
  const language =
    params.language === "hi" ? "hi" : params.language === "mix" ? undefined : "en";

  const models = Array.from(new Set([STT_MODEL, STT_FALLBACK].filter(Boolean)));
  let lastError: unknown;
  let result: { text?: string } | null = null;
  let usedModel = models[0]!;

  for (const model of models) {
    try {
      result = await runTranscription({
        bytes: params.bytes,
        filename,
        mime,
        language,
        model,
      });
      usedModel = model;
      break;
    } catch (error) {
      lastError = error;
      console.error("stt.fail", {
        model,
        mime,
        filename,
        bytes: params.bytes.length,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!result) {
    const message =
      lastError instanceof Error ? lastError.message : "Transcription failed";
    if (/corrupt|unsupported|invalid|format/i.test(message)) {
      throw new Error(
        "Could not transcribe that recording — use Type instead, or speak clearly for 3+ seconds.",
      );
    }
    throw lastError instanceof Error ? lastError : new Error("Transcription failed");
  }

  const text = (result.text ?? "").trim();

  await logAiUsage({
    userId: params.userId,
    workspaceId: params.workspaceId,
    feature: "voice_turn_stt",
    model: usedModel,
    inputTokens: Math.max(1, Math.round(params.bytes.length / 1000)),
    outputTokens: Math.max(1, Math.round(text.length / 4)),
    cached: false,
    metadata: { bytes: params.bytes.length, language: params.language, mime, filename },
  });

  return { text, model: usedModel };
}

export async function synthesizeSpeech(params: {
  text: string;
  voice?: string;
  userId?: string | null;
  workspaceId?: string | null;
}) {
  const openai = getOpenAI();
  // Cap length — interviewer lines should stay short; TTS is priced per character.
  const input = params.text.trim().slice(0, 500);
  if (!input) {
    return { audioBase64: "", mimeType: "audio/mpeg", model: TTS_MODEL };
  }

  const response = await openai.audio.speech.create({
    model: TTS_MODEL,
    voice: (params.voice as "alloy" | "nova" | "onyx") || "alloy",
    input,
    response_format: "mp3",
    speed: 1.05,
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  const audioBase64 = buffer.toString("base64");

  await logAiUsage({
    userId: params.userId,
    workspaceId: params.workspaceId,
    feature: "voice_turn_tts",
    model: TTS_MODEL,
    inputTokens: input.length,
    outputTokens: buffer.length,
    cached: false,
    metadata: { chars: input.length, bytes: buffer.length },
  });

  return {
    audioBase64,
    mimeType: "audio/mpeg",
    model: TTS_MODEL,
  };
}
