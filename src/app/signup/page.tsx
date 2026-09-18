"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-provider";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
      if (data.session) {
        window.location.assign("/dashboard");
        return;
      }
      setLoading(false);
      setMessage("Check your email to confirm your account, then sign in.");
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Sign-up failed");
    }
  }

  return (
    <main className="landing-shell relative flex min-h-[100dvh] w-full items-center justify-center px-5 py-12">
      <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] sm:right-6">
        <ThemeToggle />
      </div>
      <div className="relative z-10 w-full max-w-md rounded-[var(--radius-card)] border border-line bg-panel p-8 shadow-[var(--shadow-soft)]">
        <BrandMark href="/" size="md" />
        <h1 className="mt-6 text-3xl text-ink">Create account</h1>
        <p className="mt-2 text-sm text-muted">
          Get a ready-to-use interview prep workspace on first login.
        </p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Full name</span>
            <input
              className="w-full rounded-[var(--radius-btn)] border border-line bg-background px-3 py-2 text-ink outline-none ring-accent focus:ring-2"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
            />
          </label>
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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          {message ? <p className="text-sm text-[var(--ok)]">{message}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full disabled:opacity-60"
          >
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>
        <p className="mt-6 text-sm text-muted">
          Already registered?{" "}
          <Link className="font-semibold text-accent" href="/login">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
