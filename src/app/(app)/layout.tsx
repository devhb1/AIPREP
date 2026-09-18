import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

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
    <div className="min-h-screen lg:grid lg:grid-cols-[220px_1fr]">
      <aside className="app-chrome hidden border-r border-line bg-panel/90 px-5 py-6 lg:block">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            AIPREP
          </p>
          <h1 className="mt-2 text-2xl text-ink">Mentor OS</h1>
          <p className="mt-1 truncate text-xs text-muted">{user.email}</p>
        </div>
        <nav className="space-y-1 text-sm">
          <Link
            href="/dashboard"
            className="block rounded-lg px-3 py-2.5 text-ink hover:bg-accent-soft"
          >
            Overview
          </Link>
        </nav>
        <form action="/auth/signout" method="post" className="mt-10">
          <button className="rounded-lg px-3 py-2.5 text-sm text-muted hover:bg-accent-soft hover:text-ink">
            Sign out
          </button>
        </form>
      </aside>

      <div className="safe-pad px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <header className="app-chrome mb-4 flex items-center justify-between gap-3 lg:hidden">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
              AIPREP
            </p>
            <p className="text-sm font-semibold text-ink">Mentor OS</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="min-h-10 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-semibold"
            >
              Home
            </Link>
            <form action="/auth/signout" method="post">
              <button className="min-h-10 rounded-lg px-3 py-2 text-xs text-muted">
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
