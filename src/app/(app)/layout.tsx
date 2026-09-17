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
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-panel/90 px-5 py-6 lg:border-b-0 lg:border-r">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            AIPREP
          </p>
          <h1 className="mt-2 text-2xl text-ink">Mentor OS</h1>
          <p className="mt-1 text-xs text-muted">{user.email}</p>
        </div>
        <nav className="space-y-1 text-sm">
          <Link
            href="/dashboard"
            className="block rounded-lg px-3 py-2 text-ink hover:bg-accent-soft"
          >
            Overview
          </Link>
        </nav>
        <form action="/auth/signout" method="post" className="mt-10">
          <button className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-accent-soft hover:text-ink">
            Sign out
          </button>
        </form>
      </aside>
      <div className="px-5 py-6 lg:px-8">{children}</div>
    </div>
  );
}
