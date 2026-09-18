"use client";

import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";
import { LearnTabs } from "@/components/learn-tabs";

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
  streaming?: boolean;
  thinking?: boolean;
};

const CHIPS = [
  ["Test me", "Quiz me with 3 short KVS PRT interview questions and wait for my answers."],
  ["Explain a topic", "Explain child-centered pedagogy for a PRT classroom in simple language, with one example."],
  ["What's due", "What should I study today given my plan and weak areas?"],
  ["Review mistakes", "Help me review recent practice mistakes and how to answer better next time."],
] as const;

export default function LearnMentorPage() {
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
        "I am your mentor. Ask grounded questions about KVS PRT prep. If evidence is missing, I will say so.",
    },
  ]);

  async function sendMessage(message: string) {
    if (!message.trim() || loading) return;
    setInput("");
    setLoading(true);
    setError(null);
    setItems((prev) => [
      ...prev,
      { role: "user", content: message },
      { role: "assistant", content: "", streaming: true, thinking: true },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, message, threadId, stream: true }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Chat failed");
        setItems((prev) => prev.slice(0, -1));
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let citations: Citation[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const lines = part.split("\n");
          let event = "message";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:")) dataLine += line.slice(5).trim();
          }
          if (!dataLine) continue;
          const data = JSON.parse(dataLine);
          if (event === "started") {
            setItems((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") {
                copy[copy.length - 1] = {
                  ...last,
                  thinking: true,
                  streaming: true,
                  content: last.content || "Looking through your memory…",
                };
              }
              return copy;
            });
          } else if (event === "meta") {
            setThreadId(data.threadId);
            citations = data.citations ?? [];
            setItems((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant" && last.thinking && last.content.startsWith("Looking")) {
                copy[copy.length - 1] = { ...last, content: "", thinking: false };
              }
              return copy;
            });
          } else if (event === "token") {
            setItems((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") {
                const base =
                  last.thinking && last.content.startsWith("Looking")
                    ? ""
                    : last.content;
                copy[copy.length - 1] = {
                  ...last,
                  content: base + data.token,
                  streaming: true,
                  thinking: false,
                };
              }
              return copy;
            });
          } else if (event === "done") {
            setThreadId(data.threadId);
            setItems((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = {
                role: "assistant",
                content: data.message?.content ?? copy[copy.length - 1]?.content ?? "",
                citations: data.citations ?? citations,
              };
              return copy;
            });
          } else if (event === "error") {
            setError(data.error ?? "Chat failed");
          }
        }
      }
    } catch {
      setError("Network error");
      setItems((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await sendMessage(input.trim());
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-4xl flex-col pb-24">
      <div className="mb-4 space-y-3">
        <h2 className="text-3xl text-ink sm:text-4xl">Learn</h2>
        <p className="text-sm text-muted">
          Mentor chat grounded in trusted memory and your PDFs.
        </p>
        <LearnTabs workspaceId={workspaceId} />
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-line bg-panel p-5">
        {items.map((item, idx) => (
          <div
            key={`${item.role}-${idx}`}
            className={
              item.role === "user"
                ? "ml-4 rounded-2xl bg-accent-soft px-4 py-3 text-sm sm:ml-8"
                : "mr-4 rounded-2xl border border-line bg-white px-4 py-3 text-sm sm:mr-8"
            }
          >
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              {item.role === "user" ? "You" : "Mentor"}
              {item.thinking ? " · looking" : item.streaming ? " · typing" : ""}
            </p>
            <div className="whitespace-pre-wrap text-ink">
              {item.content || (item.streaming ? "…" : "")}
            </div>
            {item.citations && item.citations.length > 0 ? (
              <details className="mt-3 border-t border-line pt-3">
                <summary className="cursor-pointer text-xs font-semibold text-muted">
                  Sources ({item.citations.length})
                </summary>
                <div className="mt-2 space-y-2">
                  {item.citations.map((c) => (
                    <div
                      key={c.index}
                      className="rounded-lg bg-[var(--background)] p-2 text-xs text-muted"
                    >
                      [{c.index}] {c.title}
                      {c.pageNumber ? ` p.${c.pageNumber}` : ""} — {c.excerpt}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ))}
      </div>

      {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {CHIPS.map(([label, prompt]) => (
          <button
            key={label}
            type="button"
            disabled={loading}
            onClick={() => void sendMessage(prompt)}
            className="min-h-10 shrink-0 rounded-full border border-line bg-panel px-3 text-xs font-semibold disabled:opacity-50"
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about documents, syllabus, interview prep…"
          className="min-h-11 flex-1 rounded-xl border border-line bg-white px-4 py-2 text-sm"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="min-h-11 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Streaming…" : "Send"}
        </button>
      </form>
    </main>
  );
}
