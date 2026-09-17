"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";

type Citation = {
  index: number;
  title: string;
  pageNumber: number | null;
  excerpt: string;
};

type ChatItem = {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
};

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
  const [threadId, setThreadId] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([
    {
      role: "assistant",
      content:
        "I am your Phase 1 mentor. Ask questions grounded in the PDFs you uploaded for this workspace. If evidence is missing, I will say so.",
    },
  ]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const message = input.trim();
    setInput("");
    setLoading(true);
    setError(null);
    setItems((prev) => [...prev, { role: "user", content: message }]);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, message, threadId }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Chat failed");
      return;
    }

    setThreadId(data.threadId);
    setItems((prev) => [
      ...prev,
      {
        role: "assistant",
        content: data.message.content,
        citations: data.citations,
      },
    ]);
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-4xl flex-col">
      <div className="mb-4">
        <Link href={`/workspace/${workspaceId}`} className="text-sm text-accent">
          ← Workspace
        </Link>
        <h2 className="mt-2 text-4xl text-ink">Mentor chat</h2>
        <p className="mt-2 text-sm text-muted">
          Answers are grounded in indexed document excerpts with citations.
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-line bg-panel p-5">
        {items.map((item, idx) => (
          <div
            key={`${item.role}-${idx}`}
            className={
              item.role === "user"
                ? "ml-8 rounded-2xl bg-accent-soft px-4 py-3 text-sm"
                : "mr-8 rounded-2xl border border-line bg-white px-4 py-3 text-sm"
            }
          >
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              {item.role === "user" ? "You" : "Mentor"}
            </p>
            <div className="whitespace-pre-wrap text-ink">{item.content}</div>
            {item.citations && item.citations.length > 0 ? (
              <div className="mt-3 space-y-2 border-t border-line pt-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Retrieved sources
                </p>
                {item.citations.map((c) => (
                  <div key={c.index} className="rounded-lg bg-[var(--background)] p-2 text-xs text-muted">
                    [#{c.index}] {c.title}
                    {c.pageNumber ? ` · p.${c.pageNumber}` : ""}
                    <div className="mt-1 line-clamp-3">{c.excerpt}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <form onSubmit={onSubmit} className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What should I prepare first for KVS PRT interview?"
          className="flex-1 rounded-xl border border-line bg-panel px-4 py-3 text-sm outline-none ring-accent focus:ring-2"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Thinking…" : "Ask"}
        </button>
      </form>
      {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
    </main>
  );
}
