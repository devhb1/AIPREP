import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-provider";

export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="app-chrome hidden border-r border-line bg-panel/90 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 backdrop-blur lg:flex lg:flex-col">
        <div className="mb-8">
          <BrandMark href="/dashboard" size="md" />
          <p className="mt-3 truncate text-xs text-muted">{user.email}</p>
        </div>
        <nav className="space-y-1 text-sm">
          <Link
            href="/dashboard"
            className="block rounded-xl px-3 py-2.5 text-ink hover:bg-accent-soft"
          >
            Overview
          </Link>
        </nav>
        <div className="mt-auto space-y-3 pt-10">
          <ThemeToggle className="w-full" />
          <form action="/auth/signout" method="post">
            <button className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-muted hover:bg-accent-soft hover:text-ink">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="safe-pad px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:px-6 lg:px-8 lg:py-6">
        <header className="app-chrome mb-5 flex items-center justify-between gap-3 lg:hidden">
          <BrandMark href="/dashboard" size="sm" showTagline={false} />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/dashboard"
              className="min-h-10 rounded-[var(--radius-btn)] border border-line bg-panel px-3 py-2 text-xs font-semibold text-ink"
            >
              Home
            </Link>
            <form action="/auth/signout" method="post">
              <button className="min-h-10 rounded-[var(--radius-btn)] px-3 py-2 text-xs text-muted">
                Sign out
              </button>
            </form>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
