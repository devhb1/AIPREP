"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Claim = {
  id: string;
  statement: string;
  status: string;
  confidence: number | null;
  assessment: string | null;
  topic: string | null;
  conflictNote: string | null;
  sources: Array<{
    title: string | null;
    url: string | null;
    sourceType: string | null;
    qualityScore: number | null;
  }>;
};

export default function InboxPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
  const [claims, setClaims] = useState<Claim[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/claims?workspaceId=${workspaceId}&status=inbox`);
    const data = await res.json();
    setClaims(data.claims ?? []);
  }

  useEffect(() => {
    void load();
  }, [workspaceId]);

  async function act(
    claimId: string,
    action: "approve" | "reject" | "unconfirmed" | "note",
  ) {
    setBusyId(claimId);
    setError(null);
    const res = await fetch("/api/claims", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, claimId, action }),
    });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(data.error ?? "Action failed");
      return;
    }
    await load();
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/workspace/${workspaceId}/research`} className="text-sm text-accent">
          ← Research
        </Link>
        <h2 className="mt-2 text-4xl text-ink">Research inbox</h2>
        <p className="mt-2 text-sm text-muted">
          Approve only what you trust. Approved items become USER_APPROVED trusted
          memory and can ground mentor answers.
        </p>
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <section className="space-y-4">
        {claims.length === 0 ? (
          <p className="rounded-2xl border border-line bg-panel p-5 text-sm text-muted">
            No pending claims. Run a research campaign first.
          </p>
        ) : (
          claims.map((claim) => (
            <article
              key={claim.id}
              className="rounded-2xl border border-line bg-panel p-5 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  {claim.topic ?? "Claim"} · {claim.status}
                </p>
                <span className="text-xs text-muted">
                  Confidence: {Math.round((claim.confidence ?? 0.5) * 100)}%
                </span>
              </div>
              <h3 className="text-xl text-ink">{claim.statement}</h3>
              {claim.assessment ? (
                <p className="text-sm text-muted">AI assessment: {claim.assessment}</p>
              ) : null}
              {claim.conflictNote ? (
                <p className="text-sm text-[var(--warn)]">Conflict: {claim.conflictNote}</p>
              ) : null}
              <div className="space-y-1 text-xs text-muted">
                {claim.sources?.length
                  ? claim.sources.map((s, i) => (
                      <div key={`${claim.id}-${i}`}>
                        {s.title ?? "Source"}
                        {s.url ? (
                          <>
                            {" · "}
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-accent underline"
                            >
                              open
                            </a>
                          </>
                        ) : null}
                      </div>
                    ))
                  : "No linked URLs (review research notes carefully)."}
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  disabled={busyId === claim.id}
                  onClick={() => void act(claim.id, "approve")}
                  className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Approve
                </button>
                <button
                  disabled={busyId === claim.id}
                  onClick={() => void act(claim.id, "unconfirmed")}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold"
                >
                  Save unconfirmed
                </button>
                <button
                  disabled={busyId === claim.id}
                  onClick={() => void act(claim.id, "note")}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold"
                >
                  Personal note
                </button>
                <button
                  disabled={busyId === claim.id}
                  onClick={() => void act(claim.id, "reject")}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-[var(--danger)]"
                >
                  Reject
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
