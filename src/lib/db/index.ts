import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

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
