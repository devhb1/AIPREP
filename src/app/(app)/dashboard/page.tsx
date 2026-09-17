import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ensureKvsSeedWorkspace,
  ensureProfile,
  requireUser,
} from "@/lib/auth/session";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { daysUntil, formatDate } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await requireUser();
  if (!user) redirect("/login");
  await ensureProfile(user);
  await ensureKvsSeedWorkspace(user.id);

  const rows = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.userId, user.id))
    .orderBy(desc(workspaces.createdAt));

  return (
    <main className="mx-auto max-w-5xl space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Overview
        </p>
        <h2 className="mt-2 text-4xl text-ink">Preparation workspaces</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Phase 1 foundation: upload PDFs, index them with embeddings, and chat
          with a mentor grounded in your documents. Beta focus is KVS PRT
          Interview 2026.
        </p>
      </header>

      <section className="grid gap-4">
        {rows.map((workspace) => {
          const remaining = daysUntil(
            workspace.interviewDate ?? workspace.examDate,
          );
          return (
            <Link
              key={workspace.id}
              href={`/workspace/${workspace.id}`}
              className="rounded-2xl border border-line bg-panel p-5 transition hover:border-accent"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-2xl text-ink">{workspace.name}</h3>
                  <p className="mt-1 text-sm text-muted">
                    {workspace.preparationType}
                    {workspace.organization ? ` · ${workspace.organization}` : ""}
                    {workspace.role ? ` · ${workspace.role}` : ""}
                  </p>
                </div>
                {workspace.isSeed ? (
                  <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
                    Beta seed
                  </span>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
                <span>
                  Interview: {formatDate(workspace.interviewDate ?? workspace.examDate)}
                </span>
                <span>
                  Days remaining: {remaining === null ? "—" : remaining}
                </span>
                <span>Stage: {workspace.currentStage ?? "—"}</span>
              </div>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
