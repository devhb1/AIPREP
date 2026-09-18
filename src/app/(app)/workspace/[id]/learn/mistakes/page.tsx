"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LearnTabs } from "@/components/learn-tabs";

type Mistake = {
  id: string;
  note: string | null;
  questionId: string | null;
  remediationTaskId: string | null;
  createdAt: string;
};

export default function LearnMistakesPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
  const [mistakes, setMistakes] = useState<Mistake[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await fetch(
        `/api/practice?workspaceId=${workspaceId}&view=mistakes`,
      );
      const data = await res.json();
      setMistakes(data.mistakes ?? []);
    })();
  }, [workspaceId]);

  return (
    <main className="mx-auto max-w-4xl space-y-6 pb-24">
      <div className="space-y-3">
        <h2 className="text-3xl text-ink sm:text-4xl">Learn</h2>
        <p className="text-sm text-muted">
          Study what went wrong, then generate a fresh practice set and try again.
        </p>
        <LearnTabs workspaceId={workspaceId} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/workspace/${workspaceId}/learn/practice`}
          className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-white dark:text-[#042f2e]"
        >
          Practice again →
        </Link>
        <Link
          href={`/workspace/${workspaceId}/interview`}
          className="inline-flex min-h-11 items-center rounded-xl border border-line bg-panel px-4 text-sm font-semibold text-ink"
        >
          Run another mock
        </Link>
      </div>

      <section className="space-y-3">
        {mistakes.length === 0 ? (
          <p className="rounded-2xl border border-line bg-panel p-5 text-sm text-muted">
            No practice mistakes logged yet. Wrong MCQ answers and interview weak
            spots show up here.
          </p>
        ) : (
          mistakes.map((m) => (
            <article
              key={m.id}
              className="rounded-2xl border border-line bg-panel p-4 text-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                Study note
              </p>
              <p className="mt-2 text-ink leading-relaxed">{m.note}</p>
              <p className="mt-3 text-xs text-muted">
                {new Date(m.createdAt).toLocaleString()}
                {m.remediationTaskId ? " · remediation task on your Plan" : ""}
              </p>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
