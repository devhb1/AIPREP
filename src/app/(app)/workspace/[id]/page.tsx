import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatDaysRemaining } from "@/lib/utils";
import { getWorkspaceBootstrap } from "@/lib/workspaces/bootstrap";
import { InstallHomeScreenBanner } from "@/components/install-banner";
import { TodayMission } from "@/components/today-mission";
import { OnboardingChat } from "@/components/onboarding-chat";
import { Card } from "@/components/ui";

type Props = { params: Promise<{ id: string }> };

function actionHref(workspaceId: string, href: string) {
  if (!href) return `/workspace/${workspaceId}`;
  if (href.startsWith("?")) return `/workspace/${workspaceId}${href}`;
  return `/workspace/${workspaceId}/${href}`;
}

export default async function WorkspacePage({ params }: Props) {
  const user = await requireUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const data = await getWorkspaceBootstrap({ workspaceId: id, userId: user.id });
  if (!data) notFound();

  const { workspace, nextBestAction, stats, settings } = data;
  const intake = (
    settings?.settings as {
      intake?: { completedAt?: string; daysUntilInterview?: number; onboardingStep?: number };
    } | null
  )?.intake;
  const needsOnboarding = !intake?.completedAt && !intake?.daysUntilInterview;

  return (
    <main className="mx-auto max-w-3xl space-y-6 pb-24">
      <InstallHomeScreenBanner />
      {needsOnboarding ? <OnboardingChat workspaceId={id} /> : null}
      <div>
        <p className="text-sm text-muted">
          {formatDaysRemaining(stats.daysRemaining)} until interview
          {workspace.interviewDate ? ` · ${formatDate(workspace.interviewDate)}` : ""}
        </p>
        <h2 className="mt-1 text-3xl text-ink sm:text-4xl">{workspace.name}</h2>
      </div>

      <Card className="border-accent/30 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Your next best action
        </p>
        <h3 className="mt-3 text-2xl text-ink sm:text-3xl">{nextBestAction.title}</h3>
        <p className="mt-2 text-sm text-muted">{nextBestAction.why}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">~{nextBestAction.minutes} min</span>
          <Link
            href={actionHref(id, nextBestAction.href)}
            className="btn-primary inline-flex items-center"
          >
            {nextBestAction.title.length > 42
              ? "Open →"
              : nextBestAction.title}
          </Link>
        </div>
      </Card>

      <section className="grid grid-cols-3 gap-3">
        {[
          ["Days left", formatDaysRemaining(stats.daysRemaining)],
          ["Last mock", stats.lastMockScore == null ? "—" : String(stats.lastMockScore)],
          ["Docs ready", String(stats.readyDocuments)],
        ].map(([label, value]) => (
          <div key={label} className="surface-card p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">{label}</p>
            <p className="mt-2 text-xl text-ink">{value}</p>
          </div>
        ))}
      </section>

      <TodayMission workspaceId={id} />
    </main>
  );
}
