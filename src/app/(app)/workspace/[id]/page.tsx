import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { aiUsageEvents, documents, workspaces } from "@/lib/db/schema";
import { daysUntil, formatDate } from "@/lib/utils";
import { computeNextBestAction } from "@/lib/planning/planner";

type Props = { params: Promise<{ id: string }> };

export default async function WorkspacePage({ params }: Props) {
  const user = await requireUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, id), eq(workspaces.userId, user.id)))
    .limit(1);
  if (!workspace) notFound();

  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.workspaceId, id))
    .orderBy(desc(documents.createdAt));

  const usage = await db
    .select()
    .from(aiUsageEvents)
    .where(eq(aiUsageEvents.workspaceId, id))
    .orderBy(desc(aiUsageEvents.createdAt))
    .limit(30);

  const nextBestAction = await computeNextBestAction({
    workspaceId: id,
    userId: user.id,
  });

  const readyDocs = docs.filter((d) => d.status === "ready").length;
  const days = daysUntil(workspace.interviewDate ?? workspace.examDate);
  const todaySpend = usage
    .filter((u) => new Date(u.createdAt) >= new Date(new Date().setHours(0, 0, 0, 0)))
    .reduce((sum, u) => sum + (u.estimatedCostUsd ?? 0), 0);

  const actionHref = `/workspace/${id}/${nextBestAction.href}`;

  return (
    <main className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard" className="text-sm text-accent">
            ← Workspaces
          </Link>
          <h2 className="mt-2 text-4xl text-ink">{workspace.name}</h2>
          <p className="mt-2 text-sm text-muted">
            {workspace.organization} · {workspace.role} · Interview{" "}
            {formatDate(workspace.interviewDate)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["documents", "Documents"],
            ["research", "Research"],
            ["inbox", "Inbox"],
            ["knowledge", "Knowledge"],
            ["plan", "Plan"],
            ["today", "Today"],
            ["practice", "Practice"],
            ["chat", "Mentor chat"],
          ].map(([path, label]) => (
            <Link
              key={path}
              href={`/workspace/${id}/${path}`}
              className={
                path === "chat"
                  ? "rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
                  : "rounded-xl border border-line bg-panel px-4 py-2 text-sm font-semibold"
              }
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <section className="rounded-2xl border border-line bg-panel p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Your next best action
        </p>
        <h3 className="mt-3 text-3xl text-ink">{nextBestAction.title}</h3>
        <p className="mt-2 text-sm text-muted">{nextBestAction.why}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          <span className="rounded-full bg-accent-soft px-3 py-1 font-semibold text-accent">
            Priority: {nextBestAction.priority}
          </span>
          <span className="text-muted">~{nextBestAction.minutes} min</span>
          <Link href={actionHref} className="font-semibold text-accent">
            Open →
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Days remaining", days === null ? "—" : String(days)],
          ["Documents ready", String(readyDocs)],
          ["Docs total", String(docs.length)],
          ["Today AI $", todaySpend.toFixed(4)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-panel p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
            <p className="mt-2 text-2xl text-ink">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-line bg-panel p-5">
        <h3 className="text-xl text-ink">Recent documents</h3>
        <div className="mt-4 space-y-3">
          {docs.length === 0 ? (
            <p className="text-sm text-muted">No documents yet. Upload a PDF to begin.</p>
          ) : (
            docs.slice(0, 5).map((doc) => (
              <div
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 text-sm last:border-0"
              >
                <div>
                  <p className="font-medium text-ink">{doc.title}</p>
                  <p className="text-muted">{doc.fileName}</p>
                </div>
                <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
                  {doc.status}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
