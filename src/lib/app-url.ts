/** Canonical public origin for auth redirects / emails. */

const PRODUCTION_ORIGIN = "https://aiprep-kappa.vercel.app";

function stripSlash(url: string) {
  return url.replace(/\/$/, "");
}

function isLocalhost(url: string) {
  return /localhost|127\.0\.0\.1/i.test(url);
}

/**
 * Never send localhost confirm links from a production deploy.
 * Prefer NEXT_PUBLIC_APP_URL, then Vercel URL, then known production host.
 */
export function getAppOrigin() {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const vercelEnv = process.env.VERCEL_ENV; // production | preview | development
  const vercelUrl = process.env.VERCEL_URL?.trim();

  if (vercelEnv === "production") {
    if (fromEnv && !isLocalhost(fromEnv)) return stripSlash(fromEnv);
    return PRODUCTION_ORIGIN;
  }

  if (fromEnv) return stripSlash(fromEnv);

  if (vercelUrl) {
    const host = stripSlash(vercelUrl.replace(/^https?:\/\//, ""));
    return `https://${host}`;
  }

  return "http://localhost:3000";
}

export function getAuthCallbackUrl() {
  return `${getAppOrigin()}/auth/callback`;
}
