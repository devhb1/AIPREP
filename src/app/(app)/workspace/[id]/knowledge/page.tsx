"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Memory = {
  id: string;
  title: string | null;
  content: string;
  namespace: string;
  status: string;
  version: number;
  updatedAt: string;
};

export default function KnowledgePage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params.id;
  const [items, setItems] = useState<Memory[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/memory?workspaceId=${workspaceId}`);
      const data = await res.json();
      setItems(data.memory ?? []);
    })();
  }, [workspaceId]);

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href={`/workspace/${workspaceId}`} className="text-sm text-accent">
          ← Workspace
        </Link>
        <h2 className="mt-2 text-4xl text-ink">Trusted knowledge</h2>
        <p className="mt-2 text-sm text-muted">
          User-owned memory. Mentor retrieval prioritizes USER_APPROVED trusted
          items over raw documents and never auto-promotes web research here.
        </p>
      </div>

      <section className="space-y-3">
        {items.length === 0 ? (
          <p className="rounded-2xl border border-line bg-panel p-5 text-sm text-muted">
            No memory items yet. Approve claims from the research inbox.
          </p>
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-line bg-panel p-4 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-ink">
                  {item.title ?? "Memory item"}
                </p>
                <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
                  {item.namespace} · {item.status} · v{item.version}
                </span>
              </div>
              <p className="mt-2 text-muted">{item.content}</p>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
