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
  const mockFocused =
    nextBestAction.href.startsWith("interview") ||
    nextBestAction.title.toLowerCase().includes("mock");

  return (
    <main className="mx-auto max-w-3xl space-y-5 pb-24 sm:space-y-6">
      <InstallHomeScreenBanner />
      {needsOnboarding ? <OnboardingChat workspaceId={id} /> : null}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          Your interview mission
        </p>
        <h2 className="text-3xl leading-tight text-ink sm:text-4xl">{workspace.name}</h2>
        <p className="text-sm text-muted">
          {formatDaysRemaining(stats.daysRemaining)} until interview
          {workspace.interviewDate ? ` · ${formatDate(workspace.interviewDate)}` : ""}
        </p>
      </div>

      <Card className="border-accent/30 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Next best action
        </p>
        <h3 className="mt-2 text-xl leading-snug text-ink sm:mt-3 sm:text-2xl">
          {nextBestAction.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">{nextBestAction.why}</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Link
            href={actionHref(id, nextBestAction.href)}
            className="btn-primary inline-flex w-full items-center justify-center sm:w-auto"
          >
            {mockFocused ? "Start mock →" : "Open →"}
          </Link>
          <span className="text-center text-sm text-muted sm:text-left">
            ~{nextBestAction.minutes} min
          </span>
        </div>
        {mockFocused ? (
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Also:{" "}
            <Link
              href={`/workspace/${id}/memory`}
              className="font-semibold text-accent"
            >
              Approve memory inbox
            </Link>{" "}
            when you have facts waiting — it never blocks the panel.
          </p>
        ) : null}
      </Card>

      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          ["Days left", formatDaysRemaining(stats.daysRemaining)],
          [
            "Last mock",
            stats.lastMockScore == null ? "None yet" : String(stats.lastMockScore),
          ],
          ["Docs ready", String(stats.readyDocuments)],
        ].map(([label, value]) => (
          <div key={label} className="surface-card p-3 sm:p-4">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted sm:text-xs">
              {label}
            </p>
            <p className="mt-1.5 text-lg font-semibold text-ink sm:mt-2 sm:text-xl">
              {value}
            </p>
          </div>
        ))}
      </section>

      <TodayMission workspaceId={id} hasMock={stats.lastMockScore != null} />
    </main>
  );
}
