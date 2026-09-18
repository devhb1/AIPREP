"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type QueryRow = {
  id: string;
  cluster: string;
  query: string;
  status: string;
};

type Campaign = {
  id: string;
  topic: string;
  depth: string;
  status: string;
  summary: string | null;
  errorMessage: string | null;
  createdAt: string;
  queries?: QueryRow[];
  progressLog?: Array<{ at: string; message: string }>;
};

export default function ResearchPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [depth, setDepth] = useState<"quick" | "standard" | "deep">("quick");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/research/campaigns?workspaceId=${workspaceId}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not load campaigns");
      return;
    }
    setCampaigns(data.campaigns ?? []);
  }

  useEffect(() => {
    void load();
  }, [workspaceId]);

  const running = useMemo(
    () =>
      campaigns.some((c) => c.status === "queued" || c.status === "running") ||
      Boolean(activeId),
    [campaigns, activeId],
  );

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(), 2000);
    return () => clearInterval(timer);
  }, [running, workspaceId]);

  useEffect(() => {
    if (!activeId) return;
    const c = campaigns.find((x) => x.id === activeId);
    if (c && (c.status === "completed" || c.status === "failed")) {
      setActiveId(null);
      setStarting(false);
    }
  }, [campaigns, activeId]);

  async function onStart(e: FormEvent) {
    e.preventDefault();
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/research/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, depth }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 202) {
        setError(typeof data.error === "string" ? data.error : "Research failed");
        setStarting(false);
        return;
      }
      setActiveId(data.campaign?.id ?? null);
      await load();
    } catch {
      setError("Network error starting research");
      setStarting(false);
    }
  }

  const live =
    campaigns.find((c) => c.id === activeId) ??
    campaigns.find((c) => c.status === "queued" || c.status === "running");

  return (
    <main className="mx-auto max-w-4xl space-y-6 pb-24">
      <div>
        <Link href={`/workspace/${workspaceId}`} className="text-sm text-accent">
          ← Workspace
        </Link>
        <h2 className="mt-2 text-3xl text-ink sm:text-4xl">Research</h2>
        <p className="mt-2 text-sm text-muted">
          Findings become candidate claims — they never enter trusted memory until
          you approve them. Prefer Quick on phone / low budget.
        </p>
      </div>

      <form
        onSubmit={onStart}
        className="space-y-4 rounded-2xl border border-line bg-panel p-5"
      >
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Depth</span>
          <select
            value={depth}
            onChange={(e) => setDepth(e.target.value as typeof depth)}
            className="min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2"
            disabled={starting || Boolean(live)}
          >
            <option value="quick">Quick (2 queries, cheaper / faster)</option>
            <option value="standard">Standard (4 queries)</option>
            <option value="deep">Deep (6 queries — slower)</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={starting || Boolean(live)}
          className="min-h-11 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
        >
          {live ? "Research running…" : starting ? "Starting…" : "Start research campaign"}
        </button>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      </form>

      {live ? (
        <section className="space-y-3 rounded-2xl border border-accent/30 bg-panel p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg text-ink">Under the hood</h3>
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
              {live.status}
            </span>
          </div>
          <p className="text-sm text-muted">{live.topic}</p>
          <ol className="max-h-56 space-y-2 overflow-y-auto rounded-xl bg-accent-soft/40 p-3 font-mono text-xs text-ink">
            {(live.progressLog ?? []).length === 0 ? (
              <li>Waiting for first progress event…</li>
            ) : (
              (live.progressLog ?? []).map((row, i) => (
                <li key={`${row.at}-${i}`}>
                  <span className="text-muted">
                    {new Date(row.at).toLocaleTimeString()}
                  </span>{" "}
                  {row.message}
                </li>
              ))
            )}
          </ol>
          <ul className="space-y-2 text-sm">
            {(live.queries ?? []).map((q) => (
              <li
                key={q.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-line px-3 py-2"
              >
                <span className="text-muted">
                  <span className="font-semibold text-ink">{q.cluster}</span> —{" "}
                  {q.query.slice(0, 100)}
                  {q.query.length > 100 ? "…" : ""}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-accent">
                  {q.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href={`/workspace/${workspaceId}/inbox`}
          className="min-h-11 rounded-xl border border-line bg-panel px-4 py-2.5 font-semibold"
        >
          Open research inbox
        </Link>
        <Link
          href={`/workspace/${workspaceId}/knowledge`}
          className="min-h-11 rounded-xl border border-line bg-panel px-4 py-2.5 font-semibold"
        >
          Trusted knowledge
        </Link>
      </div>

      <section className="space-y-3">
        {campaigns.map((c) => (
          <div key={c.id} className="rounded-2xl border border-line bg-panel p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-lg font-medium text-ink">{c.topic}</p>
                <p className="text-muted">
                  Depth: {c.depth} · Status: {c.status}
                </p>
                {c.summary ? <p className="mt-2 text-muted">{c.summary}</p> : null}
                {c.errorMessage ? (
                  <p className="mt-2 text-[var(--danger)]">{c.errorMessage}</p>
                ) : null}
              </div>
              <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
                {c.status}
              </span>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
