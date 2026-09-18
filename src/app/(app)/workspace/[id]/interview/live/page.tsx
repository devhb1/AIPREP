"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  InterviewScorecard,
  type ScorecardReport,
} from "@/components/interview-scorecard";

type Turn = { role: "interviewer" | "candidate"; content: string };
type InterviewLanguage = "en" | "hi" | "mix";

const FILLER_RE = /\b(um+|uh+|erm+|like|you know|अं+|आ+|मतलब)\b/gi;

async function readJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) {
    throw new Error(
      res.status === 401
        ? "Session expired — sign in again."
        : `Server returned empty response (${res.status}). Try again.`,
    );
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Server error (${res.status}): ${text.slice(0, 180) || "non-JSON response"}`,
    );
  }
}

function errorMessageFromBody(data: Record<string, unknown>, fallback: string) {
  if (typeof data.error === "string") return data.error;
  if (data.error && typeof data.error === "object") {
    try {
      return JSON.stringify(data.error).slice(0, 240);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export default function LiveVoiceInterviewPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [judgeMode, setJudgeMode] = useState<"easy" | "normal" | "strict">("normal");
  const [language, setLanguage] = useState<InterviewLanguage>("en");
  const [consent, setConsent] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "ending" | "done">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ScorecardReport | null>(null);
  const [muted, setMuted] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [speaking, setSpeaking] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const turnsRef = useRef<Turn[]>([]);

  useEffect(() => {
    const lang = searchParams.get("lang");
    if (lang === "en" || lang === "hi" || lang === "mix") setLanguage(lang);
    const mode = searchParams.get("mode");
    if (mode === "easy" || mode === "normal" || mode === "strict") setJudgeMode(mode);
    if (searchParams.get("consent") === "1") setConsent(true);
  }, [searchParams]);

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  useEffect(() => {
    if (status !== "live") return;
    const timer = setInterval(() => {
      if (!startedAtRef.current) return;
      setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    return () => {
      cleanupMedia();
    };
  }, []);

  const metrics = useMemo(() => {
    const candidateTexts = turns.filter((t) => t.role === "candidate").map((t) => t.content);
    const joined = candidateTexts.join(" ");
    const fillerCount = (joined.match(FILLER_RE) ?? []).length;
    return {
      language,
      judgeMode,
      fillerCount,
      candidateTurns: candidateTexts.length,
      interviewerTurns: turns.filter((t) => t.role === "interviewer").length,
      totalCandidateChars: joined.length,
      elapsedSec,
    };
  }, [turns, elapsedSec, language, judgeMode]);

  function cleanupMedia() {
    dcRef.current?.close();
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current = null;
    pcRef.current = null;
    localStreamRef.current = null;
  }

  function pushTurn(role: Turn["role"], content: string) {
    const cleaned = content.trim();
    if (!cleaned) return;
    setTurns((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role) {
        const next = [...prev];
        next[next.length - 1] = { role, content: `${last.content} ${cleaned}`.trim() };
        return next;
      }
      return [...prev, { role, content: cleaned }];
    });
  }

  function handleRealtimeEvent(raw: string) {
    try {
      const event = JSON.parse(raw) as {
        type?: string;
        transcript?: string;
        delta?: string;
      };

      if (event.type === "input_audio_buffer.speech_started") {
        setSpeaking(true);
      }
      if (event.type === "input_audio_buffer.speech_stopped") {
        setSpeaking(false);
      }

      if (
        event.type === "conversation.item.input_audio_transcription.completed" &&
        event.transcript
      ) {
        pushTurn("candidate", event.transcript);
      }

      if (
        (event.type === "response.audio_transcript.done" ||
          event.type === "response.output_audio_transcript.done") &&
        event.transcript
      ) {
        pushTurn("interviewer", event.transcript);
      }
    } catch {
      // ignore non-json
    }
  }

  async function startVoice() {
    setError(null);
    setReport(null);
    setTurns([]);
    if (!consent) {
      setError("Enable recording/transcript consent to start.");
      return;
    }

    setStatus("connecting");
    try {
      const boot = await fetch("/api/interview/realtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          action: "start",
          judgeMode,
          language,
          recordingConsent: true,
        }),
      });
      const bootData = await readJsonResponse(boot);
      if (!boot.ok) {
        throw new Error(errorMessageFromBody(bootData, "Failed to start voice session"));
      }

      const session = bootData.session as { id?: string } | undefined;
      const realtime = bootData.realtime as
        | { clientSecret?: string; model?: string }
        | undefined;
      if (!session?.id || !realtime?.clientSecret || !realtime?.model) {
        throw new Error("Invalid voice start response from server.");
      }

      setSessionId(session.id);
      const clientSecret = realtime.clientSecret;
      const model = realtime.model;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.autoplay = true;
        // iOS: unlock audio playback after user gesture
        void audioRef.current.play().catch(() => undefined);
      }
      pc.ontrack = (event) => {
        if (audioRef.current) {
          audioRef.current.srcObject = event.streams[0] ?? null;
          void audioRef.current.play().catch(() => undefined);
        }
      };

      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      localStreamRef.current = localStream;
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (event) => handleRealtimeEvent(String(event.data));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(`https://api.openai.com/v1/realtime?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpResponse.ok) {
        const text = await sdpResponse.text();
        throw new Error(text || "Realtime WebRTC handshake failed");
      }
      const answer: RTCSessionDescriptionInit = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);

      startedAtRef.current = Date.now();
      setElapsedSec(0);
      setStatus("live");
    } catch (err) {
      cleanupMedia();
      setStatus("idle");
      const message =
        err instanceof Error
          ? err.message
          : "Could not start voice interview. Check mic permission and HTTPS.";
      if (/NotAllowedError|Permission denied/i.test(message)) {
        setError("Microphone blocked. Allow mic in Safari settings, then tap Start again.");
      } else if (/getUserMedia|NotFoundError/i.test(message)) {
        setError("No microphone found. Connect a mic and try again.");
      } else {
        setError(message);
      }
    }
  }

  function toggleMute() {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }

  async function endVoice() {
    if (!sessionId) return;
    setStatus("ending");
    setError(null);
    cleanupMedia();

    try {
      const res = await fetch("/api/interview/realtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          action: "finish",
          sessionId,
          turns: turnsRef.current,
          speechMetrics: metrics,
        }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) {
        throw new Error(errorMessageFromBody(data, "Failed to finalize voice interview"));
      }
      setReport((data.report as ScorecardReport) ?? null);
      setStatus("done");
      const finishedId = sessionId;
      setSessionId(null);
      if (finishedId) {
        router.push(
          `/workspace/${workspaceId}/interview/scorecard?sessionId=${finishedId}`,
        );
      }
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Finalize failed");
    }
  }

  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");
  const isLive = status === "live" || status === "ending";

  if (isLive) {
    return (
      <main className="fixed inset-0 z-50 flex flex-col bg-[var(--background)]">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
              Live · {language === "hi" ? "Hindi" : language === "mix" ? "Mix" : "EN"}
            </p>
            <p className="text-lg font-semibold text-ink">
              {mm}:{ss}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={toggleMute}
              disabled={status === "ending"}
              className="min-h-11 min-w-11 rounded-xl border border-line px-3 text-sm font-semibold disabled:opacity-60"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            <button
              type="button"
              onClick={() => void endVoice()}
              disabled={status === "ending"}
              className="min-h-11 rounded-xl bg-[var(--danger)] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {status === "ending" ? "Ending…" : "End"}
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
          <div
            className={`flex h-36 w-36 items-center justify-center rounded-full border-4 transition-all ${
              speaking
                ? "scale-110 border-accent bg-accent-soft shadow-[0_0_40px_rgba(0,0,0,0.08)]"
                : "border-line bg-panel"
            }`}
          >
            <span className="text-sm font-semibold text-muted">
              {speaking ? "Listening…" : muted ? "Muted" : "Ready"}
            </span>
          </div>
          {error ? <p className="text-center text-sm text-[var(--danger)]">{error}</p> : null}
        </div>

        <div className="max-h-[40vh] overflow-y-auto border-t border-line bg-panel px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Transcript
          </p>
          {turns.length === 0 ? (
            <p className="text-sm text-muted">Speak after the panel asks a question.</p>
          ) : (
            <div className="space-y-2">
              {turns.slice(-8).map((turn, idx) => (
                <div key={`${turn.role}-${idx}`} className="text-sm">
                  <span className="font-semibold text-muted">
                    {turn.role === "candidate" ? "You" : "Panel"}:{" "}
                  </span>
                  <span className="text-ink">{turn.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 pb-24">
      <div>
        <Link href={`/workspace/${workspaceId}/interview`} className="text-sm text-accent">
          ← Interview hub
        </Link>
        <h2 className="mt-2 text-3xl text-ink sm:text-4xl">Live voice interview</h2>
        <p className="mt-2 text-sm text-muted">
          Tap Start with mic allowed. On iPhone, stay on this tab — backgrounding may
          drop the session.
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
          speech={{
            fillerCount: metrics.fillerCount,
            elapsedSec,
            candidateTurns: metrics.candidateTurns,
          }}
          onClose={() => setReport(null)}
        />
      ) : null}

      <section className="space-y-4 rounded-2xl border border-line bg-panel p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Language</span>
            <select
              value={language}
              disabled={status === "connecting"}
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
              disabled={status === "connecting"}
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
            disabled={status === "connecting"}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1"
          />
          <span>
            I consent to microphone capture and transcript storage for coaching.
            Audio is processed by OpenAI Realtime for this session.
          </span>
        </label>

        {status === "idle" || status === "done" ? (
          <button
            type="button"
            onClick={() => void startVoice()}
            className="min-h-12 w-full rounded-xl bg-accent px-4 py-3 text-base font-semibold text-white sm:w-auto"
          >
            Start voice interview
          </button>
        ) : null}
        {status === "connecting" ? (
          <button
            disabled
            className="min-h-12 w-full rounded-xl bg-accent px-4 py-3 text-base font-semibold text-white opacity-60 sm:w-auto"
          >
            Connecting mic…
          </button>
        ) : null}
      </section>
    </main>
  );
}
