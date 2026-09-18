/**
 * Interview audio is transcribed in-process and discarded.
 * Never write raw clips to Storage or Postgres.
 */
export const INTERVIEW_AUDIO_POLICY = {
  persistRawAudio: false,
  maxClipBytes: 8 * 1024 * 1024,
  discardAfterMs: 0,
  userCopy:
    "Microphone audio is transcribed for this turn, then discarded. Only the transcript is stored for coaching.",
} as const;

export function discardAudioBuffer(buffer: Buffer | Uint8Array | null) {
  if (!buffer) return;
  if (Buffer.isBuffer(buffer)) buffer.fill(0);
}
