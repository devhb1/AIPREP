/** Canonical public origin for auth redirects / emails. */
export function getAppOrigin() {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
}

export function getAuthCallbackUrl() {
  return `${getAppOrigin()}/auth/callback`;
}
