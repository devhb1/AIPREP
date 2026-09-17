"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Campaign = {
  id: string;
  topic: string;
  depth: string;
  status: string;
  summary: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export default function ResearchPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [depth, setDepth] = useState<"quick" | "standard" | "deep">("quick");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/research/campaigns?workspaceId=${workspaceId}`);
    const data = await res.json();
    setCampaigns(data.campaigns ?? []);
  }

  useEffect(() => {
    void load();
  }, [workspaceId]);

  async function onStart(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/research/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, depth }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok && res.status !== 202) {
      setError(typeof data.error === "string" ? data.error : "Research failed");
      return;
    }
    if (data.error) {
      setMessage(`Campaign saved with warning: ${data.error}`);
    } else {
      setMessage(
        data.result?.summary ??
          "Research complete. Review candidate claims in the inbox.",
      );
    }
    await load();
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/workspace/${workspaceId}`} className="text-sm text-accent">
          ← Workspace
        </Link>
        <h2 className="mt-2 text-4xl text-ink">Research</h2>
        <p className="mt-2 text-sm text-muted">
          Run a KVS PRT research campaign. Findings become candidate claims — they
          never enter trusted memory until you approve them.
        </p>
        <p className="mt-1 text-xs text-muted">
          YouTube research is unavailable until YOUTUBE_API_KEY is configured.
        </p>
      </div>

      <form
        onSubmit={onStart}
        className="rounded-2xl border border-line bg-panel p-5 space-y-4"
      >
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Depth</span>
          <select
            value={depth}
            onChange={(e) => setDepth(e.target.value as typeof depth)}
            className="w-full rounded-xl border border-line bg-white px-3 py-2"
          >
            <option value="quick">Quick (2 queries, cheaper)</option>
            <option value="standard">Standard (4 queries)</option>
            <option value="deep">Deep (6 queries)</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Researching…" : "Start research campaign"}
        </button>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        {message ? <p className="text-sm text-[var(--ok)]">{message}</p> : null}
      </form>

      <div className="flex gap-2 text-sm">
        <Link
          href={`/workspace/${workspaceId}/inbox`}
          className="rounded-xl border border-line bg-panel px-4 py-2 font-semibold"
        >
          Open research inbox
        </Link>
        <Link
          href={`/workspace/${workspaceId}/knowledge`}
          className="rounded-xl border border-line bg-panel px-4 py-2 font-semibold"
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
