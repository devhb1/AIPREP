/**
 * Browser WAV capture for interview STT.
 * MediaRecorder webm/mp4 is frequently rejected by OpenAI as "corrupted/unsupported"
 * (esp. short clips / Safari mp4 / Chrome opus). Linear PCM WAV is universally accepted.
 */

export type WavCapture = {
  stop: () => Promise<Blob>;
  /** Elapsed ms since start */
  elapsedMs: () => number;
};

function mergeFloat32(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export async function startWavCapture(stream: MediaStream): Promise<WavCapture> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx({ sampleRate: 16000 });
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but widely supported; size 4096 balances latency/CPU.
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const silent = ctx.createGain();
  silent.gain.value = 0;

  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
  };

  source.connect(processor);
  processor.connect(silent);
  silent.connect(ctx.destination);

  const startedAt = Date.now();
  let stopped = false;

  return {
    elapsedMs: () => Date.now() - startedAt,
    stop: async () => {
      if (stopped) return encodeWav(mergeFloat32(chunks), ctx.sampleRate);
      stopped = true;
      try {
        processor.disconnect();
        source.disconnect();
        silent.disconnect();
      } catch {
        // ignore
      }
      const wav = encodeWav(mergeFloat32(chunks), ctx.sampleRate);
      try {
        await ctx.close();
      } catch {
        // ignore
      }
      return wav;
    },
  };
}
