"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

type Turn = { role: "interviewer" | "candidate"; content: string };

const FILLER_RE = /\b(um+|uh+|erm+|like|you know)\b/gi;

export default function LiveVoiceInterviewPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;

  const [judgeMode, setJudgeMode] = useState<"easy" | "normal" | "strict">("normal");
  const [consent, setConsent] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "ending" | "done">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [muted, setMuted] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const turnsRef = useRef<Turn[]>([]);

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
      fillerCount,
      candidateTurns: candidateTexts.length,
      interviewerTurns: turns.filter((t) => t.role === "interviewer").length,
      totalCandidateChars: joined.length,
      elapsedSec,
    };
  }, [turns, elapsedSec]);

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
          recordingConsent: true,
        }),
      });
      const bootData = await boot.json();
      if (!boot.ok) {
        throw new Error(bootData.error ?? "Failed to start voice session");
      }

      setSessionId(bootData.session.id);
      const clientSecret = bootData.realtime.clientSecret as string;
      const model = bootData.realtime.model as string;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.autoplay = true;
      }
      pc.ontrack = (event) => {
        if (audioRef.current) {
          audioRef.current.srcObject = event.streams[0] ?? null;
        }
      };

      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      setError(err instanceof Error ? err.message : "Could not start voice interview");
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
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to finalize voice interview");
      }
      setReport(data.report ?? null);
      setStatus("done");
      setSessionId(null);
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Finalize failed");
    }
  }

  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/workspace/${workspaceId}/interview`} className="text-sm text-accent">
          ← Interview
        </Link>
        <h2 className="mt-2 text-4xl text-ink">Live voice interview</h2>
        <p className="mt-2 text-sm text-muted">
          Realtime OpenAI voice session with live transcript. API keys stay on the
          server; the browser uses an ephemeral token.
        </p>
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <section className="rounded-2xl border border-line bg-panel p-5 space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Judge mode</span>
          <select
            value={judgeMode}
            disabled={status === "live" || status === "connecting"}
            onChange={(e) => setJudgeMode(e.target.value as typeof judgeMode)}
            className="rounded-xl border border-line bg-white px-3 py-2"
          >
            <option value="easy">Easy</option>
            <option value="normal">Normal</option>
            <option value="strict">Strict</option>
          </select>
        </label>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={consent}
            disabled={status === "live" || status === "connecting"}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1"
          />
          <span>
            I consent to microphone capture and transcript storage for coaching
            feedback. Audio is processed by OpenAI Realtime for this session.
          </span>
        </label>

        <div className="flex flex-wrap gap-2">
          {status === "idle" || status === "done" ? (
            <button
              onClick={() => void startVoice()}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
            >
              Start voice interview
            </button>
          ) : null}
          {status === "connecting" ? (
            <button
              disabled
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white opacity-60"
            >
              Connecting…
            </button>
          ) : null}
          {status === "live" || status === "ending" ? (
            <>
              <button
                onClick={toggleMute}
                disabled={status === "ending"}
                className="rounded-xl border border-line px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {muted ? "Unmute" : "Mute"}
              </button>
              <button
                onClick={() => void endVoice()}
                disabled={status === "ending"}
                className="rounded-xl border border-line px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {status === "ending" ? "Ending…" : "End interview"}
              </button>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-muted">
          <span>Status: {status}</span>
          <span>
            Timer: {mm}:{ss}
          </span>
          <span>Fillers (approx): {metrics.fillerCount}</span>
          <span>Candidate turns: {metrics.candidateTurns}</span>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-panel p-5 space-y-3">
        <h3 className="text-xl text-ink">Live transcript</h3>
        {turns.length === 0 ? (
          <p className="text-sm text-muted">Transcript appears as you and the panel speak.</p>
        ) : (
          turns.map((turn, idx) => (
            <div
              key={`${turn.role}-${idx}`}
              className={
                turn.role === "candidate"
                  ? "ml-6 rounded-xl bg-accent-soft px-4 py-3 text-sm"
                  : "mr-6 rounded-xl border border-line bg-white px-4 py-3 text-sm"
              }
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                {turn.role === "candidate" ? "You" : "Panel"}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-ink">{turn.content}</p>
            </div>
          ))
        )}
      </section>

      {report ? (
        <section className="rounded-2xl border border-line bg-panel p-5 space-y-3 text-sm">
          <h3 className="text-xl text-ink">Voice mock report</h3>
          <p className="text-muted">
            Overall score: {String(report.overallScore ?? "—")} / 10
          </p>
          <p className="text-ink">{String(report.summary ?? "")}</p>
          <div>
            <p className="font-semibold">Speech snapshot</p>
            <p className="text-muted">
              Fillers ≈ {metrics.fillerCount}, candidate chars {metrics.totalCandidateChars},
              duration {mm}:{ss}
            </p>
          </div>
          <ul className="list-disc pl-5 text-muted">
            {((report.drills as string[]) ?? []).map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
