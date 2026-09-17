import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { aiUsageEvents, documents, workspaces } from "@/lib/db/schema";
import { daysUntil, formatDate } from "@/lib/utils";

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

  const readyDocs = docs.filter((d) => d.status === "ready").length;
  const pendingDocs = docs.filter((d) =>
    ["uploaded", "processing", "queued"].includes(d.status),
  ).length;
  const days = daysUntil(workspace.interviewDate ?? workspace.examDate);
  const todaySpend = usage
    .filter((u) => new Date(u.createdAt) >= new Date(new Date().setHours(0, 0, 0, 0)))
    .reduce((sum, u) => sum + (u.estimatedCostUsd ?? 0), 0);

  const nextBestAction =
    readyDocs === 0
      ? {
          title: "Upload your official KVS notification / syllabus PDF",
          why: "Phase 1 mentor answers are grounded only in documents you upload.",
          priority: "HIGH",
          minutes: 10,
        }
      : pendingDocs > 0
        ? {
            title: "Wait for indexing to finish, then open Mentor chat",
            why: `${pendingDocs} document(s) are still processing.`,
            priority: "MEDIUM",
            minutes: 5,
          }
        : {
            title: "Ask the mentor what to prepare first for KVS PRT",
            why: "Your documents are indexed. Get a grounded briefing.",
            priority: "HIGH",
            minutes: 15,
          };

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
        <div className="flex gap-2">
          <Link
            href={`/workspace/${id}/documents`}
            className="rounded-xl border border-line bg-panel px-4 py-2 text-sm font-semibold"
          >
            Documents
          </Link>
          <Link
            href={`/workspace/${id}/chat`}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            Mentor chat
          </Link>
        </div>
      </div>

      <section className="rounded-2xl border border-line bg-panel p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Your next best action
        </p>
        <h3 className="mt-3 text-3xl text-ink">{nextBestAction.title}</h3>
        <p className="mt-2 text-sm text-muted">{nextBestAction.why}</p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <span className="rounded-full bg-accent-soft px-3 py-1 font-semibold text-accent">
            Priority: {nextBestAction.priority}
          </span>
          <span className="text-muted">~{nextBestAction.minutes} min</span>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Days remaining", days === null ? "—" : String(days)],
          ["Documents", String(docs.length)],
          ["Ready", String(readyDocs)],
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
