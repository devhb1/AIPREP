import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** Prefer Session pooler on Vercel (IPv4). Direct db.*.supabase.co is often unresolvable there. */
export function resolveDatabaseUrl() {
  const direct = process.env.DATABASE_URL?.trim();
  const pooler = process.env.SESSION_POOLER_URL?.trim();

  if (pooler) return pooler;
  if (direct) return direct;
  throw new Error("DATABASE_URL (or SESSION_POOLER_URL) is not set");
}

function createDb() {
  const connectionString = resolveDatabaseUrl();

  const withSsl = connectionString.includes("sslmode=")
    ? connectionString
    : `${connectionString}${connectionString.includes("?") ? "&" : "?"}sslmode=require`;

  const client = postgres(withSsl, {
    prepare: false,
    max: 10,
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

const instance = globalForDb.__aiprepDb ?? createDb();
if (process.env.NODE_ENV !== "production") {
  globalForDb.__aiprepDb = instance;
}

export const db = instance.db;
export const sql = instance.client;
