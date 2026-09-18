"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-provider";

function safeNextPath(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  if (raw.startsWith("/login") || raw.startsWith("/signup")) return "/dashboard";
  return raw;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const signIn = supabase.auth.signInWithPassword({ email, password });
      const timed = await Promise.race([
        signIn,
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  "Sign-in timed out. Check your connection and try again.",
                ),
              ),
            20000,
          ),
        ),
      ]);
      if (timed.error) {
        setError(timed.error.message);
        setLoading(false);
        return;
      }
      const next = safeNextPath(
        new URLSearchParams(window.location.search).get("next"),
      );
      // Full navigation so session cookies apply; soft push+refresh often hangs.
      window.location.assign(next);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Sign-in failed");
    }
  }

  return (
    <main className="landing-shell relative flex min-h-[100dvh] w-full items-center justify-center px-5 py-12">
      <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] sm:right-6">
        <ThemeToggle />
      </div>
      <div className="relative z-10 w-full max-w-md rounded-[var(--radius-card)] border border-line bg-panel p-8 shadow-[var(--shadow-soft)]">
        <BrandMark href="/" size="md" />
        <h1 className="mt-6 text-3xl text-ink">Sign in</h1>
        <p className="mt-2 text-sm text-muted">
          Continue preparing with your AI interview mentor.
        </p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Email</span>
            <input
              className="w-full rounded-[var(--radius-btn)] border border-line bg-background px-3 py-2 text-ink outline-none ring-accent focus:ring-2"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Password</span>
            <input
              className="w-full rounded-[var(--radius-btn)] border border-line bg-background px-3 py-2 text-ink outline-none ring-accent focus:ring-2"
              type="password"
              required
              minLength={6}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-sm text-muted">
          No account?{" "}
          <Link className="font-semibold text-accent" href="/signup">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
