"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Mistake = {
  id: string;
  note: string | null;
  questionId: string | null;
  remediationTaskId: string | null;
  createdAt: string;
};

export default function MistakesPage() {
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
    <main className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/workspace/${workspaceId}/practice`} className="text-sm text-accent">
          ← Practice
        </Link>
        <h2 className="mt-2 text-4xl text-ink">Mistake notebook</h2>
        <p className="mt-2 text-sm text-muted">
          Wrong answers create remediation tasks and lower topic mastery for
          replanning.
        </p>
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
