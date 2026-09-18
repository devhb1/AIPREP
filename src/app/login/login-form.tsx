"use client";

import { useActionState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-provider";
import { signInAction, type AuthActionState } from "./actions";

const initial: AuthActionState = {};

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInAction, initial);

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
        <form action={action} className="mt-8 space-y-4">
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Email</span>
            <input
              className="w-full rounded-[var(--radius-btn)] border border-line bg-background px-3 py-2 text-ink outline-none ring-accent focus:ring-2"
              type="email"
              name="email"
              required
              autoComplete="email"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Password</span>
            <input
              className="w-full rounded-[var(--radius-btn)] border border-line bg-background px-3 py-2 text-ink outline-none ring-accent focus:ring-2"
              type="password"
              name="password"
              required
              minLength={6}
              autoComplete="current-password"
            />
          </label>
          {state.error ? (
            <p className="text-sm text-[var(--danger)]">{state.error}</p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="btn-primary w-full disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
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
