"use client";

import Link from "next/link";
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

type AnswerState = {
  selectedId: string;
  isCorrect: boolean;
  explanation: string;
  correctLabel?: string;
  correctContent?: string;
};

export default function LearnPracticePage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});

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
    setAnswers({});
    await load();
  }

  async function attempt(questionId: string, selectedOptionId: string) {
    if (answers[questionId] || busyId) return;
    setBusyId(questionId);
    setError(null);
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        selectedId: selectedOptionId,
        isCorrect: false,
        explanation: "Checking…",
      },
    }));
    try {
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
        setAnswers((prev) => {
          const next = { ...prev };
          delete next[questionId];
          return next;
        });
        setError(data.error ?? "Attempt failed");
        return;
      }
      setAnswers((prev) => ({
        ...prev,
        [questionId]: {
          selectedId: selectedOptionId,
          isCorrect: Boolean(data.isCorrect),
          explanation: String(data.explanation ?? ""),
          correctLabel: data.correctOption?.label,
          correctContent: data.correctOption?.content,
        },
      }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 pb-24">
      <div className="space-y-3">
        <h2 className="text-3xl text-ink sm:text-4xl">Learn</h2>
        <p className="text-sm text-muted">
          Grounded MCQs from trusted memory and your uploaded PDFs. Tap an option
          to check it.
        </p>
        <LearnTabs workspaceId={workspaceId} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void generate()}
          disabled={loading}
          className="min-h-11 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:text-[#042f2e]"
        >
          {loading ? "Generating…" : "Generate practice set"}
        </button>
        <Link
          href={`/workspace/${workspaceId}/learn/mistakes`}
          className="inline-flex min-h-11 items-center rounded-xl border border-line bg-panel px-4 text-sm font-semibold text-ink"
        >
          Review mistakes →
        </Link>
      </div>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <section className="space-y-4">
        {questions.length === 0 ? (
          <p className="rounded-2xl border border-line bg-panel p-5 text-sm text-muted">
            No questions yet. Generate a set after uploading docs / approving memory.
          </p>
        ) : (
          questions.map((q) => {
            const answer = answers[q.id];
            return (
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
                  {q.options.map((opt) => {
                    const selected = answer?.selectedId === opt.id;
                    const showCorrect =
                      answer &&
                      !answer.isCorrect &&
                      answer.correctLabel === opt.label;
                    let style =
                      "border-line bg-background text-ink hover:bg-accent-soft";
                    if (selected && answer?.isCorrect) {
                      style = "border-[var(--ok)] bg-[var(--ok)]/10 text-ink";
                    } else if (selected && answer && !answer.isCorrect) {
                      style = "border-[var(--danger)] bg-[var(--danger)]/10 text-ink";
                    } else if (showCorrect) {
                      style = "border-[var(--ok)] bg-[var(--ok)]/10 text-ink";
                    } else if (answer) {
                      style = "border-line bg-background text-muted";
                    }
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={Boolean(answer) || busyId === q.id}
                        onClick={() => void attempt(q.id, opt.id)}
                        className={`block w-full rounded-xl border px-3 py-3 text-left text-sm transition disabled:cursor-default ${style}`}
                      >
                        <span className="font-semibold">{opt.label}.</span> {opt.content}
                      </button>
                    );
                  })}
                </div>
                {answer && answer.explanation !== "Checking…" ? (
                  <div
                    className={`rounded-xl border px-3 py-3 text-sm ${
                      answer.isCorrect
                        ? "border-[var(--ok)]/40 bg-[var(--ok)]/5 text-ink"
                        : "border-[var(--danger)]/30 bg-[var(--danger)]/5 text-ink"
                    }`}
                  >
                    <p className="font-semibold">
                      {answer.isCorrect ? "Correct" : "Incorrect"}
                    </p>
                    {answer.explanation ? (
                      <p className="mt-1 text-muted">{answer.explanation}</p>
                    ) : null}
                    {!answer.isCorrect && answer.correctContent ? (
                      <p className="mt-2 text-sm">
                        <span className="font-semibold text-ink">Right answer: </span>
                        <span className="text-muted">
                          {answer.correctLabel}. {answer.correctContent}
                        </span>
                      </p>
                    ) : null}
                    {!answer.isCorrect ? (
                      <p className="mt-2 text-xs text-muted">
                        Saved to Mistakes with a remediation note — review and practice again.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
