"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  InterviewScorecard,
  type ScorecardReport,
} from "@/components/interview-scorecard";

type Turn = {
  role: "interviewer" | "candidate";
  content: string;
  score?: number | null;
  feedback?: string | null;
};

type InterviewLanguage = "en" | "hi" | "mix";

function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

async function readJson(res: Response) {
  const text = await res.text();
  if (!text) throw new Error(`Empty response (${res.status})`);
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(text.slice(0, 180) || `Bad response (${res.status})`);
  }
}

function playBase64Audio(base64: string, mimeType: string, audioEl: HTMLAudioElement) {
  if (!base64) return;
  const url = `data:${mimeType};base64,${base64}`;
  audioEl.src = url;
  void audioEl.play().catch(() => undefined);
}

export default function VoiceDrillPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [judgeMode, setJudgeMode] = useState<"easy" | "normal" | "strict">("normal");
  const [language, setLanguage] = useState<InterviewLanguage>("en");
  const [consent, setConsent] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<
    "idle" | "starting" | "ready" | "recording" | "thinking" | "ending" | "done"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ScorecardReport | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const lang = searchParams.get("lang");
    if (lang === "en" || lang === "hi" || lang === "mix") setLanguage(lang);
    const mode = searchParams.get("mode");
    if (mode === "easy" || mode === "normal" || mode === "strict") setJudgeMode(mode);
    if (searchParams.get("consent") === "1") setConsent(true);
  }, [searchParams]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current?.stop();
    };
  }, []);

  function ensureAudio() {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.autoplay = true;
    }
    return audioRef.current;
  }

  async function startDrill() {
    setError(null);
    setReport(null);
    setHint(null);
    if (!consent) {
      setError("Enable consent to start the voice drill.");
      return;
    }
    setStatus("starting");
    try {
      const res = await fetch("/api/interview/voice-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          action: "start",
          judgeMode,
          language,
          recordingConsent: true,
          targetMinutes: 10,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Could not start");
      }
      const session = data.session as { id?: string };
      if (!session?.id || typeof data.openingQuestion !== "string") {
        throw new Error("Invalid start response");
      }
      setSessionId(session.id);
      setTurns([{ role: "interviewer", content: data.openingQuestion }]);
      playBase64Audio(
        String(data.audioBase64 ?? ""),
        String(data.audioMimeType ?? "audio/mpeg"),
        ensureAudio(),
      );
      setStatus("ready");
      setHint("Listen, then hold Record and answer. Release to send.");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Start failed");
    }
  }

  async function beginRecord() {
    if (status !== "ready" || !sessionId) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      const mimeType = pickRecorderMime();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.start(250);
      setStatus("recording");
    } catch (err) {
      setError(
        err instanceof Error
          ? /NotAllowed|Permission/i.test(err.message)
            ? "Microphone blocked — allow mic, then try again."
            : err.message
          : "Could not open microphone",
      );
    }
  }

  async function endRecord() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || status !== "recording" || !sessionId) return;

    setStatus("thinking");
    const blob: Blob = await new Promise((resolve, reject) => {
      recorder.onstop = () => {
        resolve(
          new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          }),
        );
      };
      recorder.onerror = () => reject(new Error("Recording failed"));
      recorder.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    });

    if (blob.size < 800) {
      setStatus("ready");
      setError("Recording too short — hold for at least a second.");
      return;
    }

    try {
      const form = new FormData();
      form.append("workspaceId", workspaceId);
      form.append("sessionId", sessionId);
      form.append("language", language);
      form.append(
        "audio",
        blob,
        blob.type.includes("mp4") ? "answer.m4a" : "answer.webm",
      );

      const res = await fetch("/api/interview/voice-turn", {
        method: "POST",
        body: form,
      });
      const data = await readJson(res);
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Turn failed");
      }

      const transcript = String(data.transcript ?? "");
      const interviewerMessage = String(data.interviewerMessage ?? "");
      setTurns((prev) => [
        ...prev,
        {
          role: "candidate",
          content: transcript,
          score: typeof data.score === "number" ? data.score : null,
          feedback: typeof data.feedback === "string" ? data.feedback : null,
        },
        { role: "interviewer", content: interviewerMessage },
      ]);
      playBase64Audio(
        String(data.audioBase64 ?? ""),
        String(data.audioMimeType ?? "audio/mpeg"),
        ensureAudio(),
      );

      if (data.shouldEnd) {
        setHint("Panel is ready to wrap — you can End for a scorecard.");
      }
      setStatus("ready");
    } catch (err) {
      setStatus("ready");
      setError(err instanceof Error ? err.message : "Could not process answer");
    }
  }

  async function endDrill() {
    if (!sessionId) return;
    setStatus("ending");
    setError(null);
    try {
      const res = await fetch("/api/interview/voice-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          action: "end",
          sessionId,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "End failed");
      }
      setReport((data.report as ScorecardReport) ?? null);
      setStatus("done");
      const id = sessionId;
      setSessionId(null);
      router.push(`/workspace/${workspaceId}/interview/scorecard?sessionId=${id}`);
    } catch (err) {
      setStatus("ready");
      setError(err instanceof Error ? err.message : "Could not end drill");
    }
  }

  const live = status === "ready" || status === "recording" || status === "thinking" || status === "ending";

  return (
    <main className="mx-auto max-w-4xl space-y-6 pb-24">
      <div>
        <Link href={`/workspace/${workspaceId}/interview`} className="text-sm text-accent">
          ← Interview hub
        </Link>
        <h2 className="mt-2 text-3xl text-ink sm:text-4xl">Voice drill</h2>
        <p className="mt-2 text-sm text-muted">
          Cheap turn-based voice: you speak → we transcribe → panel replies in text +
          short TTS. ~5–10× less than live Realtime.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {report ? (
        <InterviewScorecard
          report={report}
          mode="voice"
          language={language}
          judgeMode={judgeMode}
          onClose={() => setReport(null)}
        />
      ) : null}

      {!live ? (
        <section className="space-y-4 rounded-2xl border border-line bg-panel p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Language</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as InterviewLanguage)}
                className="min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2"
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="mix">Mix (Hinglish)</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted">Judge mode</span>
              <select
                value={judgeMode}
                onChange={(e) => setJudgeMode(e.target.value as typeof judgeMode)}
                className="min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2"
              >
                <option value="easy">Easy</option>
                <option value="normal">Normal</option>
                <option value="strict">Strict</option>
              </select>
            </label>
          </div>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1"
            />
            <span>
              I consent to microphone capture and transcript storage for coaching.
            </span>
          </label>
          <button
            type="button"
            disabled={status === "starting"}
            onClick={() => void startDrill()}
            className="min-h-12 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
          >
            {status === "starting" ? "Starting…" : "Start voice drill"}
          </button>
          <p className="text-xs text-muted">
            Need continuous conversation?{" "}
            <Link
              href={`/workspace/${workspaceId}/interview/live?lang=${language}&mode=${judgeMode}`}
              className="text-accent underline"
            >
              Live Realtime (expensive)
            </Link>
          </p>
        </section>
      ) : (
        <section className="space-y-4 rounded-2xl border border-line bg-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink">
              {status === "recording"
                ? "Recording…"
                : status === "thinking"
                  ? "Transcribing + panel thinking…"
                  : status === "ending"
                    ? "Building scorecard…"
                    : "Your turn"}
            </p>
            <button
              type="button"
              disabled={status === "ending" || status === "thinking" || status === "recording"}
              onClick={() => void endDrill()}
              className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold disabled:opacity-60"
            >
              End + scorecard
            </button>
          </div>

          {hint ? <p className="text-sm text-muted">{hint}</p> : null}

          <button
            type="button"
            disabled={status === "thinking" || status === "ending"}
            onPointerDown={(e) => {
              e.preventDefault();
              void beginRecord();
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              void endRecord();
            }}
            onPointerCancel={() => void endRecord()}
            onPointerLeave={() => {
              if (status === "recording") void endRecord();
            }}
            className={`flex min-h-28 w-full touch-none select-none items-center justify-center rounded-2xl text-base font-semibold text-white transition ${
              status === "recording"
                ? "bg-[var(--danger)]"
                : "bg-accent active:scale-[0.99]"
            } disabled:opacity-60`}
          >
            {status === "recording"
              ? "Release to send"
              : status === "thinking"
                ? "Working…"
                : "Hold to answer"}
          </button>

          <div className="max-h-[45vh] space-y-3 overflow-y-auto">
            {turns.map((t, i) => (
              <article
                key={`${t.role}-${i}`}
                className="rounded-xl border border-line bg-white px-3 py-2 text-sm"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  {t.role === "candidate" ? "You" : "Panel"}
                  {t.score != null ? ` · ${t.score}/10` : ""}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-ink">{t.content}</p>
                {t.feedback ? (
                  <p className="mt-1 text-xs text-muted">{t.feedback}</p>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
