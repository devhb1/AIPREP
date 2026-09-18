import { toFile } from "openai";
import { getOpenAI } from "./client";
import { logAiUsage } from "./usage";

const STT_MODEL = process.env.STT_MODEL || "gpt-4o-mini-transcribe";
/** Classic tts-1 is the cheapest reliable TTS for short interviewer lines. */
const TTS_MODEL = process.env.TTS_MODEL || "tts-1";

export async function transcribeAudio(params: {
  bytes: Buffer;
  filename: string;
  mimeType?: string;
  language?: "en" | "hi" | "mix";
  userId?: string | null;
  workspaceId?: string | null;
}) {
  const openai = getOpenAI();
  const file = await toFile(params.bytes, params.filename, {
    type: params.mimeType || "audio/webm",
  });

  const language =
    params.language === "hi" ? "hi" : params.language === "mix" ? undefined : "en";

  const result = await openai.audio.transcriptions.create({
    file,
    model: STT_MODEL,
    ...(language ? { language } : {}),
  });

  const text = (result.text ?? "").trim();

  await logAiUsage({
    userId: params.userId,
    workspaceId: params.workspaceId,
    feature: "voice_turn_stt",
    model: STT_MODEL,
    inputTokens: Math.max(1, Math.round(params.bytes.length / 1000)),
    outputTokens: Math.max(1, Math.round(text.length / 4)),
    cached: false,
    metadata: { bytes: params.bytes.length, language: params.language },
  });

  return { text, model: STT_MODEL };
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
