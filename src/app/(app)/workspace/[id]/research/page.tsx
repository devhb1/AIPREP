"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

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

type DocOption = { id: string; title: string; status: string };

export default function ResearchPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const workspaceId = params.id;
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [docs, setDocs] = useState<DocOption[]>([]);
  const [depth, setDepth] = useState<"quick" | "standard" | "deep">("quick");
  const [mode, setMode] = useState<"defaults" | "custom">("defaults");
  const [userPrompt, setUserPrompt] = useState("");
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  async function load() {
    const [cRes, dRes] = await Promise.all([
      fetch(`/api/research/campaigns?workspaceId=${workspaceId}`),
      fetch(`/api/documents?workspaceId=${workspaceId}`),
    ]);
    const cData = await cRes.json();
    if (!cRes.ok) {
      setError(cData.error ?? "Could not load campaigns");
      return;
    }
    setCampaigns(cData.campaigns ?? []);
    if (dRes.ok) {
      const dData = await dRes.json();
      setDocs(
        (dData.documents ?? []).map((d: DocOption) => ({
          id: d.id,
          title: d.title,
          status: d.status,
        })),
      );
    }
  }

  useEffect(() => {
    void load();
  }, [workspaceId]);

  useEffect(() => {
    const topic = searchParams.get("topic");
    if (topic) {
      setMode("custom");
      setUserPrompt(`Research more on: ${topic}`);
    }
  }, [searchParams]);

  const running = useMemo(
    () =>
      campaigns.some((c) => c.status === "queued" || c.status === "running") ||
      Boolean(activeId),
    [campaigns, activeId],
  );

  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > 120_000) {
        clearInterval(timer);
        return;
      }
      void load();
    }, 2500);
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
    if (mode === "custom" && userPrompt.trim().length < 3) {
      setError("Enter a custom research prompt (at least 3 characters).");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/research/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          depth,
          useDefaults: mode === "defaults",
          userPrompt: mode === "custom" ? userPrompt.trim() : undefined,
          documentIds: selectedDocs,
          topic:
            mode === "custom"
              ? userPrompt.trim().slice(0, 120)
              : undefined,
        }),
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

  function toggleDoc(id: string) {
    setSelectedDocs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
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
          Use the default research pack or a custom prompt. Optionally ground claims in
          your PDFs. Findings stay candidates until you approve them in Memory.
        </p>
      </div>

      <form
        onSubmit={onStart}
        className="space-y-4 rounded-2xl border border-line bg-panel p-5"
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("defaults")}
            className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold ${
              mode === "defaults"
                ? "bg-accent text-white dark:text-[#042f2e]"
                : "border border-line bg-panel text-ink"
            }`}
          >
            Default pack
          </button>
          <button
            type="button"
            onClick={() => setMode("custom")}
            className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold ${
              mode === "custom"
                ? "bg-accent text-white dark:text-[#042f2e]"
                : "border border-line bg-panel text-ink"
            }`}
          >
            Custom prompt
          </button>
        </div>

        {mode === "custom" ? (
          <label className="block text-sm">
            <span className="mb-1 block text-muted">What should we research?</span>
            <textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              rows={3}
              placeholder="e.g. Latest document checklist and demo lesson expectations"
              className="w-full rounded-xl border border-line bg-background px-3 py-2 text-sm text-ink"
              disabled={starting || Boolean(live)}
            />
          </label>
        ) : (
          <p className="text-sm text-muted">
            Runs the curated official / PYQ / panel query pack for teaching interviews.
          </p>
        )}

        <label className="block text-sm">
          <span className="mb-1 block text-muted">Depth</span>
          <select
            value={depth}
            onChange={(e) => setDepth(e.target.value as typeof depth)}
            className="min-h-11 w-full rounded-xl border border-line bg-background px-3 py-2 text-ink"
            disabled={starting || Boolean(live)}
          >
            <option value="quick">Quick (2 queries)</option>
            <option value="standard">Standard (4 queries)</option>
            <option value="deep">Deep (6 queries)</option>
          </select>
        </label>

        {docs.length > 0 ? (
          <div>
            <p className="mb-2 text-sm text-muted">
              Ground in PDFs (optional) — only ready files can be selected
            </p>
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-line bg-background p-3">
              {docs.map((d) => {
                const ready = d.status === "ready";
                return (
                  <label
                    key={d.id}
                    className={`flex min-h-10 items-start gap-2 text-sm ${
                      ready ? "" : "opacity-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDocs.includes(d.id)}
                      onChange={() => toggleDoc(d.id)}
                      disabled={!ready || starting || Boolean(live)}
                      className="mt-1"
                    />
                    <span>
                      {d.title}{" "}
                      <span className="text-xs text-muted">({d.status})</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-line bg-background p-3 text-sm text-muted">
            No PDFs yet.{" "}
            <Link
              href={`/workspace/${workspaceId}/documents`}
              className="font-semibold text-accent"
            >
              Upload documents
            </Link>{" "}
            to ground research in your files.
          </p>
        )}

        <button
          type="submit"
          disabled={starting || Boolean(live)}
          className="min-h-11 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
        >
          {live ? "Research running…" : starting ? "Starting…" : "Start research"}
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
        </section>
      ) : null}

      <Link
        href={`/workspace/${workspaceId}/memory?tab=scraped`}
        className="inline-flex min-h-11 items-center rounded-xl border border-line bg-panel px-4 py-2.5 text-sm font-semibold"
      >
        Review claims in Memory →
      </Link>

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
                {(c.queries ?? []).length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-muted">
                    {(c.queries ?? []).slice(0, 4).map((q) => (
                      <li key={q.id}>
                        <span className="font-semibold text-ink">{q.cluster}</span> ·{" "}
                        {q.status} — {q.query.slice(0, 80)}
                        {q.query.length > 80 ? "…" : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {c.status === "completed" ? (
                  <Link
                    href={`/workspace/${workspaceId}/memory?tab=scraped`}
                    className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white"
                  >
                    Review claims in Memory →
                  </Link>
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
