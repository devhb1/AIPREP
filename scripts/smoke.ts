/**
 * Non-destructive smoke checks for local/prod readiness.
 * Does not call OpenAI or mutate data.
 */
import "dotenv/config";

type Check = { name: string; ok: boolean; detail?: string };

function req(checks: Check[], name: string) {
  const v = process.env[name];
  checks.push({
    name: `env:${name}`,
    ok: Boolean(v && String(v).trim()),
    detail: v ? "set" : "MISSING",
  });
}

async function pingHealth(checks: Check[]) {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
    checks.push({
      name: "http:/api/health",
      ok: res.ok && body.ok === true,
      detail: `${res.status}`,
    });
  } catch (error) {
    checks.push({
      name: "http:/api/health",
      ok: false,
      detail: `unreachable (${error instanceof Error ? error.message : "error"}). Start npm run dev first for this check.`,
    });
  }
}

async function pingRedis(checks: Check[]) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  try {
    const res = await fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    checks.push({
      name: "redis:ping",
      ok: res.ok,
      detail: `${res.status}`,
    });
  } catch (error) {
    checks.push({
      name: "redis:ping",
      ok: false,
      detail: error instanceof Error ? error.message : "error",
    });
  }
}

async function main() {
  const checks: Check[] = [];

  req(checks, "OPENAI_API_KEY");
  req(checks, "NEXT_PUBLIC_SUPABASE_URL");
  req(checks, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  req(checks, "SUPABASE_SERVICE_ROLE_KEY");
  req(checks, "DATABASE_URL");
  req(checks, "UPSTASH_REDIS_REST_URL");
  req(checks, "UPSTASH_REDIS_REST_TOKEN");
  req(checks, "NEXT_PUBLIC_APP_URL");

  const dbUrl = process.env.DATABASE_URL ?? "";
  const direct = /db\.[a-z0-9]+\.supabase\.co/i.test(dbUrl);
  const pooler = /pooler\.supabase\.com/i.test(dbUrl);
  checks.push({
    name: "database_url_shape",
    ok: pooler || !direct,
    detail: pooler
      ? "session/transaction pooler host"
      : direct
        ? "direct db.*.supabase.co — prefer Session pooler (IPv4)"
        : "custom host",
  });

  await pingRedis(checks);
  await pingHealth(checks);

  let failed = 0;
  for (const c of checks) {
    const mark = c.ok ? "PASS" : "FAIL";
    if (!c.ok) failed += 1;
    console.log(`${mark}  ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }

  console.log(
    failed === 0
      ? "\nSmoke OK. Next: npm run db:migrate (if needed), then §150 flow in DEPLOY.md."
      : `\n${failed} check(s) failed. Fix env / migrate / start the app, then re-run.`,
  );

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
