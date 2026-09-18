import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatDaysRemaining } from "@/lib/utils";
import { getWorkspaceBootstrap } from "@/lib/workspaces/bootstrap";
import { WorkspaceChipNav } from "@/components/workspace-nav";
import { InstallHomeScreenBanner } from "@/components/install-banner";

type Props = { params: Promise<{ id: string }> };

export default async function WorkspacePage({ params }: Props) {
  const user = await requireUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const data = await getWorkspaceBootstrap({ workspaceId: id, userId: user.id });
  if (!data) notFound();

  const { workspace, nextBestAction, stats } = data;
  const actionHref = `/workspace/${id}/${nextBestAction.href}`;

  return (
    <main className="mx-auto max-w-5xl space-y-6 pb-24">
      <InstallHomeScreenBanner />
      <div className="space-y-4">
        <div>
          <Link href="/dashboard" className="text-sm text-accent">
            ← Workspaces
          </Link>
          <h2 className="mt-2 text-3xl text-ink sm:text-4xl">{workspace.name}</h2>
          <p className="mt-2 text-sm text-muted">
            {workspace.organization} · {workspace.role} · Interview{" "}
            {formatDate(workspace.interviewDate)}
          </p>
        </div>
        <WorkspaceChipNav workspaceId={id} />
      </div>

      <section className="rounded-2xl border border-accent/30 bg-panel p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Your next best action
        </p>
        <h3 className="mt-3 text-2xl text-ink sm:text-3xl">{nextBestAction.title}</h3>
        <p className="mt-2 text-sm text-muted">{nextBestAction.why}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full bg-accent-soft px-3 py-1 font-semibold text-accent">
            Priority: {nextBestAction.priority}
          </span>
          <span className="text-muted">~{nextBestAction.minutes} min</span>
          <Link
            href={actionHref}
            className="min-h-10 rounded-xl bg-accent px-4 py-2 font-semibold text-white"
          >
            Open →
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Days remaining", formatDaysRemaining(stats.daysRemaining)],
          ["Documents ready", String(stats.readyDocuments)],
          ["Docs total", String(stats.documentCount)],
          ["Today AI $", stats.todaySpendUsd.toFixed(4)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-panel p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
            <p className="mt-2 text-xl text-ink sm:text-2xl">{value}</p>
          </div>
        ))}
      </section>

      <p className="text-sm text-muted">
        Flow: Upload PDFs in Memory → Research → approve in Memory → Plan intake →
        live voice interview.
      </p>
    </main>
  );
}
