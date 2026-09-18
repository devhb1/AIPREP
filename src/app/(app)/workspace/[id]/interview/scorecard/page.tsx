"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  InterviewScorecard,
  type ScorecardReport,
} from "@/components/interview-scorecard";

type SessionPayload = {
  id: string;
  mode: string;
  judgeMode: string;
  overallScore: number | null;
  summary: string | null;
  report: ScorecardReport;
  speechMetrics?: {
    language?: string;
    fillerCount?: number;
    elapsedSec?: number;
    candidateTurns?: number;
  };
};

export default function ScorecardPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");

  const [session, setSession] = useState<SessionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      setError("Missing session");
      return;
    }
    void (async () => {
      try {
        const res = await fetch(
          `/api/interview?workspaceId=${workspaceId}&sessionId=${sessionId}`,
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Could not load scorecard");
          return;
        }
        setSession(data.session ?? null);
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceId, sessionId]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 pb-24">
      <div>
        <Link href={`/workspace/${workspaceId}/interview`} className="text-sm text-accent">
          ← Interview hub
        </Link>
        <h2 className="mt-2 text-3xl text-ink sm:text-4xl">Scorecard</h2>
      </div>

      {loading ? (
        <div className="space-y-3 rounded-2xl border border-line bg-panel p-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-[var(--background)]" />
          ))}
        </div>
      ) : null}

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      {session ? (
        <InterviewScorecard
          report={
            (session.report as ScorecardReport) ?? {
              overallScore: session.overallScore ?? undefined,
              summary: session.summary ?? undefined,
            }
          }
          mode={session.mode === "voice" ? "voice" : "text"}
          language={session.speechMetrics?.language}
          judgeMode={session.judgeMode}
          speech={
            session.mode === "voice"
              ? {
                  fillerCount: session.speechMetrics?.fillerCount,
                  elapsedSec: session.speechMetrics?.elapsedSec,
                  candidateTurns: session.speechMetrics?.candidateTurns,
                }
              : undefined
          }
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/workspace/${workspaceId}/interview/live`}
          className="min-h-11 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          Practice again
        </Link>
        <Link
          href={`/workspace/${workspaceId}/interview`}
          className="min-h-11 rounded-xl border border-line px-4 py-2 text-sm font-semibold"
        >
          Back to hub
        </Link>
      </div>
    </main>
  );
}
