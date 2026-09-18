import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-provider";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <main className="landing-shell relative min-h-[100dvh] overflow-hidden">
      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-4 sm:px-8">
        <BrandMark size="md" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/login"
            className="hidden min-h-11 items-center rounded-[var(--radius-btn)] px-4 text-sm font-semibold text-ink sm:inline-flex"
          >
            Sign in
          </Link>
          <Link href="/signup" className="btn-primary inline-flex items-center">
            Get started
          </Link>
        </div>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-start px-5 pb-20 pt-8 sm:px-8 sm:pt-14">
        <p className="rounded-full border border-line bg-panel/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-accent backdrop-blur">
          Mock panels · coaching · plan
        </p>
        <h1 className="mt-5 max-w-2xl text-4xl font-bold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-6xl">
          Walk into your interview
          <span className="mt-2 block text-[var(--accent-ink)]">already practiced.</span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
          AI Prep is your AI interview mentor — short mock panels, clear scorecards,
          and a study loop that adapts to how you actually answer.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/signup" className="btn-primary inline-flex items-center text-base">
            Start preparing →
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-[var(--radius-btn)] border border-line bg-panel px-4 text-sm font-semibold text-ink"
          >
            Sign in
          </Link>
        </div>

        <div className="mt-12 grid w-full gap-3 sm:grid-cols-3">
          {[
            ["Mock panel", "HR → pedagogy → awareness, then a real scorecard."],
            ["Mentor chat", "Ask grounded questions while you prep."],
            ["Adaptive plan", "Next best action after every mock."],
          ].map(([title, body]) => (
            <div key={title} className="surface-card">
              <p className="text-sm font-semibold text-ink">{title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
