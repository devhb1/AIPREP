"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
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
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    if (data.session) {
      router.push("/dashboard");
      router.refresh();
      return;
    }
    setMessage("Check your email to confirm your account, then sign in.");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-2xl border border-line bg-panel p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
          AIPREP
        </p>
        <h1 className="mt-3 text-3xl text-ink">Create account</h1>
        <p className="mt-2 text-sm text-muted">
          We will seed a KVS PRT Interview 2026 workspace on first login.
        </p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Full name</span>
            <input
              className="w-full rounded-xl border border-line bg-white px-3 py-2 outline-none ring-accent focus:ring-2"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Email</span>
            <input
              className="w-full rounded-xl border border-line bg-white px-3 py-2 outline-none ring-accent focus:ring-2"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">Password</span>
            <input
              className="w-full rounded-xl border border-line bg-white px-3 py-2 outline-none ring-accent focus:ring-2"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          {message ? <p className="text-sm text-[var(--ok)]">{message}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
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
