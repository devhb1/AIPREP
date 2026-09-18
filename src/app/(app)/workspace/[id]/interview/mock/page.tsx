"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  InterviewScorecard,
  type ScorecardReport,
} from "@/components/interview-scorecard";
import { Button, Chip } from "@/components/ui";
import { INTERVIEW_AUDIO_POLICY } from "@/lib/interview/audio-policy";

type Turn = {
  role: "interviewer" | "candidate";
  content: string;
  score?: number | null;
  feedback?: string | null;
  personaLabel?: string;
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

export default function MockPanelPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [judgeMode, setJudgeMode] = useState<"easy" | "normal" | "strict">("normal");
  const [language, setLanguage] = useState<InterviewLanguage>("en");
  const [minutes, setMinutes] = useState(10);
  const [consent, setConsent] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [personaLabel, setPersonaLabel] = useState("Presiding / HR");
  const [status, setStatus] = useState<
    "idle" | "starting" | "ready" | "recording" | "thinking" | "ending" | "done"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ScorecardReport | null>(null);
  const [typed, setTyped] = useState("");
  const [showType, setShowType] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const lang = searchParams.get("lang");
    if (lang === "en" || lang === "hi" || lang === "mix") setLanguage(lang);
    const mode = searchParams.get("mode");
    if (mode === "easy" || mode === "normal" || mode === "strict") setJudgeMode(mode);
    const mins = Number(searchParams.get("mins"));
    if ([5, 10, 15].includes(mins)) setMinutes(mins);
    if (searchParams.get("consent") === "1") setConsent(true);
  }, [searchParams]);

  useEffect(() => {
    void fetch(`/api/interview/warmup?workspaceId=${workspaceId}`);
  }, [workspaceId]);

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

  function applyTurn(data: Record<string, unknown>, candidateText: string) {
    const interviewerMessage = String(data.interviewerMessage ?? "");
    const label =
      typeof data.personaLabel === "string" ? data.personaLabel : personaLabel;
    setPersonaLabel(label);
    setTurns((prev) => [
      ...prev,
      {
        role: "candidate",
        content: candidateText,
        score: typeof data.score === "number" ? data.score : null,
        feedback: typeof data.feedback === "string" ? data.feedback : null,
      },
      { role: "interviewer", content: interviewerMessage, personaLabel: label },
    ]);
    playBase64Audio(
      String(data.audioBase64 ?? ""),
      String(data.audioMimeType ?? "audio/mpeg"),
      ensureAudio(),
    );
    if (data.shouldEnd) {
      void finishSession();
      return;
    }
    setStatus("ready");
  }

  async function startMock() {
    setError(null);
    setReport(null);
    if (!consent) {
      setError("Enable consent to start the mock panel.");
      return;
    }
    setStatus("starting");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    try {
      const res = await fetch("/api/interview/voice-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          workspaceId,
          action: "start",
          judgeMode,
          language,
          recordingConsent: true,
          targetMinutes: minutes,
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
      const label =
        typeof data.personaLabel === "string" ? data.personaLabel : "Presiding / HR";
      setPersonaLabel(label);
      setTurns([
        {
          role: "interviewer",
          content: data.openingQuestion,
          personaLabel: label,
        },
      ]);
      playBase64Audio(
        String(data.audioBase64 ?? ""),
        String(data.audioMimeType ?? "audio/mpeg"),
        ensureAudio(),
      );
      setStatus("ready");
    } catch (err) {
      setStatus("idle");
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Start timed out — check connection and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Start failed");
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function toggleRecord() {
    if (status === "recording") {
      await endRecord();
      return;
    }
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
    if (!recorder || !sessionId) return;
    if (recorder.state === "inactive" && status !== "recording") return;

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
      if (recorder.state !== "inactive") recorder.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    });

    if (blob.size < 800) {
      setStatus("ready");
      setError("Recording too short — tap, speak, then tap again.");
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
      const res = await fetch("/api/interview/voice-turn", { method: "POST", body: form });
      const data = await readJson(res);
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Turn failed");
      }
      applyTurn(data, String(data.transcript ?? ""));
    } catch (err) {
      setStatus("ready");
      setError(err instanceof Error ? err.message : "Could not process answer");
    }
  }

  async function sendTyped(e: FormEvent) {
    e.preventDefault();
    if (!sessionId || !typed.trim() || status !== "ready") return;
    const answer = typed.trim();
    setTyped("");
    setStatus("thinking");
    try {
      const res = await fetch("/api/interview/voice-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          action: "text_answer",
          sessionId,
          answer,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Turn failed");
      }
      applyTurn(data, answer);
    } catch (err) {
      setStatus("ready");
      setError(err instanceof Error ? err.message : "Could not send answer");
    }
  }

  async function finishSession() {
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
      setError(err instanceof Error ? err.message : "Could not end mock");
    }
  }

  const live =
    status === "ready" ||
    status === "recording" ||
    status === "thinking" ||
    status === "ending";
  const currentQuestion = [...turns].reverse().find((t) => t.role === "interviewer");

  useEffect(() => {
    if (!live) {
      document.body.classList.remove("interview-live");
      return;
    }
    document.body.classList.add("interview-live");
    return () => document.body.classList.remove("interview-live");
  }, [live]);

  useEffect(() => {
    if (!live) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [live]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  if (live) {
    return (
      <section className="fixed inset-0 z-[80] flex flex-col bg-background px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            {personaLabel}
            {status === "thinking" ? " · considering" : ""}
            {status === "recording" ? " · listening" : ""}
          </p>
          <div className="flex items-center gap-3">
            <span className="tabular-nums text-sm text-muted">
              {mm}:{ss}
            </span>
            <button
              type="button"
              disabled={status === "ending" || status === "thinking"}
              onClick={() => void finishSession()}
              className="text-sm text-muted underline disabled:opacity-50"
            >
              End
            </button>
          </div>
        </div>

        {error ? (
          <p className="mt-3 rounded-[var(--radius-btn)] border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}

        <p className="mt-8 flex-1 text-2xl leading-snug text-ink sm:text-3xl">
          {currentQuestion?.content ?? "…"}
        </p>

        <button
          type="button"
          disabled={status === "thinking" || status === "ending"}
          onClick={() => void toggleRecord()}
          className={`flex min-h-28 w-full items-center justify-center rounded-[var(--radius-card)] text-base font-semibold text-white ${
            status === "recording" ? "bg-[var(--danger)]" : "bg-accent"
          } disabled:opacity-60`}
        >
          {status === "recording"
            ? "Tap to send"
            : status === "thinking"
              ? `${personaLabel} is considering…`
              : "Tap to speak"}
        </button>

        <button
          type="button"
          className="mt-3 min-h-11 text-sm font-semibold text-accent"
          onClick={() => setShowType((v) => !v)}
        >
          {showType ? "Hide keyboard" : "Type instead"}
        </button>

        {showType ? (
          <form onSubmit={sendTyped} className="mt-2 flex gap-2">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={status !== "ready"}
              placeholder="Type your answer…"
              className="min-h-11 flex-1 rounded-[var(--radius-btn)] border border-line bg-background px-3 text-sm text-ink"
            />
            <Button type="submit" disabled={status !== "ready" || !typed.trim()}>
              Send
            </Button>
          </form>
        ) : null}
      </section>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 pb-24">
      <div>
        <Link href={`/workspace/${workspaceId}/interview`} className="text-sm text-accent">
          ← Interview hub
        </Link>
        <h2 className="mt-2 text-3xl text-ink sm:text-4xl">Mock panel</h2>
        <p className="mt-2 text-sm text-muted">
          HR opens, pedagogy probes, general awareness, then HR closes — like a
          real teaching interview panel.
        </p>
      </div>

      {error ? (
        <p className="rounded-[var(--radius-btn)] border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-3 text-sm text-[var(--danger)]">
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

      <section className="surface-card space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Duration
          </p>
          <div className="flex flex-wrap gap-2">
            {[5, 10, 15].map((m) => (
              <Chip key={m} active={minutes === m} onClick={() => setMinutes(m)}>
                {m} min
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Judge
          </p>
          <div className="flex flex-wrap gap-2">
            {(["easy", "normal", "strict"] as const).map((m) => (
              <Chip key={m} active={judgeMode === m} onClick={() => setJudgeMode(m)}>
                {m}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Language
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["en", "EN"],
                ["hi", "HI"],
                ["mix", "Mix"],
              ] as const
            ).map(([value, label]) => (
              <Chip
                key={value}
                active={language === value}
                onClick={() => setLanguage(value)}
              >
                {label}
              </Chip>
            ))}
          </div>
        </div>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1"
          />
          <span>
            I consent to microphone capture. {INTERVIEW_AUDIO_POLICY.userCopy}
          </span>
        </label>
        <Button
          className="w-full"
          disabled={status === "starting"}
          onClick={() => void startMock()}
        >
          {status === "starting" ? "Starting…" : "Start mock panel"}
        </Button>
      </section>
    </main>
  );
}
