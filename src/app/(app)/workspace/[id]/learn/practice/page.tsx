"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LearnTabs } from "@/components/learn-tabs";

type Option = {
  id: string;
  label: string;
  content: string;
};

type Question = {
  id: string;
  prompt: string;
  difficulty: string | null;
  groundingNote: string | null;
  explanation: string | null;
  options: Option[];
};

export default function LearnPracticePage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  async function load() {
    const res = await fetch(`/api/practice?workspaceId=${workspaceId}`);
    const data = await res.json();
    setQuestions(data.questions ?? []);
  }

  useEffect(() => {
    void load();
  }, [workspaceId]);

  async function generate() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/practice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, action: "generate", count: 3 }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Generation failed");
      return;
    }
    await load();
  }

  async function attempt(questionId: string, selectedOptionId: string) {
    setError(null);
    const res = await fetch("/api/practice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        action: "attempt",
        questionId,
        selectedOptionId,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Attempt failed");
      return;
    }
    setFeedback((prev) => ({
      ...prev,
      [questionId]: data.isCorrect
        ? `Correct. ${data.explanation ?? ""}`
        : `Incorrect. ${data.explanation ?? ""} Remediation task created.`,
    }));
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 pb-24">
      <div className="space-y-3">
        <h2 className="text-3xl text-ink sm:text-4xl">Learn</h2>
        <p className="text-sm text-muted">
          Grounded MCQs from trusted memory and documents.
        </p>
        <LearnTabs workspaceId={workspaceId} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void generate()}
          disabled={loading}
          className="min-h-11 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Generating…" : "Generate practice set"}
        </button>
      </div>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <section className="space-y-4">
        {questions.length === 0 ? (
          <p className="rounded-2xl border border-line bg-panel p-5 text-sm text-muted">
            No questions yet. Generate a set after uploading docs / approving memory.
          </p>
        ) : (
          questions.map((q) => (
            <article key={q.id} className="space-y-3 rounded-2xl border border-line bg-panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">
                  {q.difficulty ?? "medium"}
                </p>
                {q.groundingNote ? (
                  <p className="text-xs text-muted">Grounding: {q.groundingNote}</p>
                ) : null}
              </div>
              <h3 className="text-lg text-ink">{q.prompt}</h3>
              <div className="space-y-2">
                {q.options.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => void attempt(q.id, opt.id)}
                    className="block w-full rounded-xl border border-line px-3 py-2 text-left text-sm hover:bg-accent-soft"
                  >
                    <span className="font-semibold">{opt.label}.</span> {opt.content}
                  </button>
                ))}
              </div>
              {feedback[q.id] ? (
                <p className="text-sm text-muted">{feedback[q.id]}</p>
              ) : null}
            </article>
          ))
        )}
      </section>
    </main>
  );
}
