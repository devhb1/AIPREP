"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

type Tab = "all" | "scraped" | "approved" | "notes" | "stories" | "documents";

type LedgerItem = {
  id: string;
  ledgerKind: string;
  kind?: string;
  statement?: string;
  content?: string;
  title?: string | null;
  status?: string;
  topic?: string | null;
  topicId?: string | null;
  votes?: number | null;
  confidence?: number | null;
  assessment?: string | null;
  conflictNote?: string | null;
  pageCount?: number | null;
  sources?: Array<{
    title: string | null;
    url: string | null;
    sourceType: string | null;
  }>;
};

type Topic = { topic: string; claimCount: number; memoryCount: number };

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "all", label: "All" },
  { id: "scraped", label: "Scraped claims" },
  { id: "approved", label: "Approved" },
  { id: "notes", label: "My notes" },
  { id: "stories", label: "Stories" },
  { id: "documents", label: "Documents" },
];

export default function MemoryPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialTab = (searchParams.get("tab") as Tab | null) ?? "all";
  const [tab, setTab] = useState<Tab>(
    ["all", "scraped", "approved", "notes", "stories", "documents"].includes(initialTab)
      ? initialTab
      : "all",
  );
  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteTopic, setNoteTopic] = useState("");

  async function load(nextTab = tab) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/memory?workspaceId=${workspaceId}&tab=${nextTab}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load memory");
        return;
      }
      setLedger(data.ledger ?? []);
      setTopics(data.topics ?? []);
      setCounts(data.counts ?? {});
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(tab);
  }, [workspaceId, tab]);

  async function act(body: Record<string, unknown>, id?: string) {
    setBusyId(id ?? "global");
    setError(null);
    const res = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, ...body }),
    });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(data.error ?? "Action failed");
      return;
    }
    if (data.redirect) {
      router.push(data.redirect);
      return;
    }
    await load();
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    await act({
      action: "add_note",
      content: note.trim(),
      topic: noteTopic.trim() || undefined,
      title: "My note",
    });
    setNote("");
    setNoteTopic("");
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 pb-24">
      <div>
        <Link href={`/workspace/${workspaceId}`} className="text-sm text-accent">
          ← Workspace
        </Link>
        <h2 className="mt-2 text-3xl text-ink sm:text-4xl">Memory</h2>
        <p className="mt-2 text-sm text-muted">
          One ledger for scraped claims, trusted knowledge, notes, stories, and
          documents.
        </p>
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setTopicFilter(null);
              router.replace(`?tab=${t.id}`, { scroll: false });
            }}
            className={`min-h-11 shrink-0 rounded-xl px-4 py-2 text-sm font-semibold ${
              tab === t.id
                ? "bg-accent text-white"
                : "border border-line bg-panel text-ink"
            }`}
          >
            {t.label}
            {counts[t.id] != null ? ` (${counts[t.id]})` : ""}
          </button>
        ))}
      </div>

      <section className="rounded-2xl border border-line bg-panel p-5">
        <h3 className="text-lg text-ink">Topics</h3>
        <p className="mt-1 text-sm text-muted">
          Counts from claims and memory. Tap a topic to filter, or research more.
        </p>
        {topics.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No topics yet — run research.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {topics.slice(0, 12).map((t) => (
              <li
                key={t.topic}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${
                  topicFilter === t.topic
                    ? "border-accent bg-accent-soft"
                    : "border-line bg-white"
                }`}
              >
                <button
                  type="button"
                  className="text-left"
                  onClick={() =>
                    setTopicFilter((prev) => (prev === t.topic ? null : t.topic))
                  }
                >
                  <p className="font-medium text-ink">{t.topic}</p>
                  <p className="text-xs text-muted">
                    {t.claimCount} claims · {t.memoryCount} memory
                  </p>
                </button>
                <button
                  type="button"
                  disabled={busyId === t.topic}
                  onClick={() =>
                    void act({ action: "research_topic", topic: t.topic }, t.topic)
                  }
                  className="min-h-10 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold"
                >
                  Add more
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-panel p-5">
        <h3 className="text-lg text-ink">Add a note</h3>
        <form onSubmit={addNote} className="mt-3 space-y-2">
          <input
            value={noteTopic}
            onChange={(e) => setNoteTopic(e.target.value)}
            placeholder="Topic (optional)"
            className="min-h-11 w-full rounded-xl border border-line px-3 py-2 text-sm"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Something you want mentor + plan to remember…"
            rows={3}
            className="w-full rounded-xl border border-line px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            Save note
          </button>
        </form>
      </section>

      <section className="space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-2xl border border-line bg-panel"
              />
            ))}
          </div>
        ) : ledger.length === 0 ? (
          <p className="rounded-2xl border border-line bg-panel p-5 text-sm text-muted">
            Nothing in this tab yet.
          </p>
        ) : (
          ledger
            .filter((item) => {
              if (!topicFilter) return true;
              const topic = item.topic ?? item.topicId;
              return topic === topicFilter;
            })
            .map((item) => {
            const body = item.statement ?? item.content ?? item.title ?? "";
            const topic = item.topic ?? item.topicId;
            return (
              <article
                key={`${item.ledgerKind}-${item.id}`}
                className="rounded-2xl border border-line bg-panel p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                      {item.ledgerKind}
                      {item.status ? ` · ${item.status}` : ""}
                      {topic ? ` · ${topic}` : ""}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{body}</p>
                    {item.assessment ? (
                      <p className="mt-2 text-xs text-muted">{item.assessment}</p>
                    ) : null}
                    {item.conflictNote ? (
                      <p className="mt-2 text-xs font-medium text-[var(--danger)]">
                        Conflict: {item.conflictNote}
                      </p>
                    ) : null}
                  </div>
                  {item.votes != null ? (
                    <span className="text-sm font-semibold text-accent">
                      {item.votes > 0 ? `+${item.votes}` : item.votes}
                    </span>
                  ) : null}
                </div>

                {item.sources && item.sources.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-xs text-muted">
                    {item.sources.map((s, idx) => (
                      <li key={`${item.id}-s-${idx}`}>
                        {s.url ? (
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent underline"
                          >
                            {s.title ?? s.url}
                          </a>
                        ) : (
                          (s.title ?? "Source")
                        )}
                        {s.sourceType ? ` (${s.sourceType})` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  {item.ledgerKind === "scraped" ? (
                    <>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() =>
                          void act({ action: "approve", claimId: item.id }, item.id)
                        }
                        className="min-h-10 rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() =>
                          void act({ action: "reject", claimId: item.id }, item.id)
                        }
                        className="min-h-10 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </>
                  ) : null}

                  {item.kind === "memory" || item.ledgerKind === "approved" || item.ledgerKind === "notes" ? (
                    <>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() =>
                          void act({ action: "upvote", memoryId: item.id }, item.id)
                        }
                        className="min-h-10 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() =>
                          void act({ action: "downvote", memoryId: item.id }, item.id)
                        }
                        className="min-h-10 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold"
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() =>
                          void act({ action: "delete", memoryId: item.id }, item.id)
                        }
                        className="min-h-10 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-[var(--danger)]"
                      >
                        Delete
                      </button>
                    </>
                  ) : null}

                  {topic ? (
                    <button
                      type="button"
                      onClick={() =>
                        void act({ action: "research_topic", topic }, topic)
                      }
                      className="min-h-10 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold"
                    >
                      Add more on topic
                    </button>
                  ) : null}

                  {item.ledgerKind === "documents" ? (
                    <Link
                      href={`/workspace/${workspaceId}/documents`}
                      className="min-h-10 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold"
                    >
                      Open docs
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
