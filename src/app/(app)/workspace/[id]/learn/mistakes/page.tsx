"use client";

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
          Wrong answers create remediation tasks and lower topic mastery.
        </p>
        <LearnTabs workspaceId={workspaceId} />
      </div>

      <section className="space-y-3">
        {mistakes.length === 0 ? (
          <p className="rounded-2xl border border-line bg-panel p-5 text-sm text-muted">
            No mistakes logged yet.
          </p>
        ) : (
          mistakes.map((m) => (
            <article
              key={m.id}
              className="rounded-2xl border border-line bg-panel p-4 text-sm"
            >
              <p className="text-ink">{m.note}</p>
              <p className="mt-2 text-xs text-muted">
                {new Date(m.createdAt).toLocaleString()}
                {m.remediationTaskId ? " · remediation task created" : ""}
              </p>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
