import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Prefer pooler URLs on Vercel (IPv4).
 * Session mode (port 5432) caps ~15 clients and blows up under serverless
 * (EMAXCONNSESSION). Prefer transaction mode (port 6543) when possible.
 */
export function resolveDatabaseUrl() {
  const transaction = process.env.TRANSACTION_POOLER_URL?.trim();
  const pooler = process.env.SESSION_POOLER_URL?.trim();
  const direct = process.env.DATABASE_URL?.trim();

  const raw = transaction || pooler || direct;
  if (!raw) {
    throw new Error(
      "DATABASE_URL (or SESSION_POOLER_URL / TRANSACTION_POOLER_URL) is not set",
    );
  }

  return preferTransactionPooler(raw);
}

/** Rewrite Supabase pooler :5432 (session) → :6543 (transaction) for serverless. */
function preferTransactionPooler(url: string) {
  try {
    const u = new URL(url);
    const isPooler = /\.pooler\.supabase\.com$/i.test(u.hostname);
    if (isPooler && (u.port === "5432" || u.port === "")) {
      u.port = "6543";
      // pgbouncer transaction mode requires this for many ORMs
      if (!u.searchParams.has("pgbouncer")) {
        u.searchParams.set("pgbouncer", "true");
      }
      return u.toString();
    }
  } catch {
    // keep original
  }
  return url;
}

function createDb() {
  const connectionString = resolveDatabaseUrl();

  const withSsl = connectionString.includes("sslmode=")
    ? connectionString
    : `${connectionString}${connectionString.includes("?") ? "&" : "?"}sslmode=require`;

  // Dev + serverless: keep a tiny pool so one long AI call can't block auth/pages.
  const client = postgres(withSsl, {
    prepare: false,
    max: process.env.NODE_ENV === "development" ? 3 : 1,
    idle_timeout: 20,
    max_lifetime: 60 * 5,
    connect_timeout: 8,
    ssl: "require",
  });

  return {
    client,
    db: drizzle(client, { schema }),
  };
}

const globalForDb = globalThis as unknown as {
  __aiprepDb?: ReturnType<typeof createDb>;
};

// Cache in ALL envs — without this, every Vercel lambda cold-start opens a new pool.
const instance = globalForDb.__aiprepDb ?? createDb();
globalForDb.__aiprepDb = instance;

export const db = instance.db;
export const sql = instance.client;
