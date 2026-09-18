import "dotenv/config";
import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import postgres from "postgres";

function resolveDatabaseUrl() {
  const pooler = process.env.SESSION_POOLER_URL?.trim();
  const direct = process.env.DATABASE_URL?.trim();
  if (pooler) return pooler;
  if (direct) return direct;
  throw new Error("DATABASE_URL (or SESSION_POOLER_URL) is not set");
}

function looksLikeDirectSupabaseHost(url: string) {
  try {
    const host = new URL(url).hostname;
    return /^db\.[a-z0-9]+\.supabase\.co$/i.test(host);
  } catch {
    return false;
  }
}

async function main() {
  const url = resolveDatabaseUrl();

  if (looksLikeDirectSupabaseHost(url)) {
    console.warn(
      [
        "",
        "WARNING: Using direct db.<project>.supabase.co.",
        "On Vercel this often fails with ENOTFOUND. Prefer SESSION_POOLER_URL.",
        "",
      ].join("\n"),
    );
  } else {
    console.log("Using pooler/custom DATABASE connection host.");
  }

  const withSsl = url.includes("sslmode=")
    ? url
    : `${url}${url.includes("?") ? "&" : "?"}sslmode=require`;

  const sql = postgres(withSsl, {
    prepare: false,
    max: 1,
    ssl: "require",
    connect_timeout: 15,
  });
  const dir = resolve(process.cwd(), "db/migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    console.log(`Running ${file}...`);
    const migration = readFileSync(resolve(dir, file), "utf8");
    await sql.unsafe(migration);
    console.log(`Done ${file}`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceKey) {
    const res = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: "documents",
        name: "documents",
        public: false,
        file_size_limit: 15728640,
        allowed_mime_types: ["application/pdf"],
      }),
    });
    if (res.ok) {
      console.log("Created storage bucket: documents");
    } else {
      const text = await res.text();
      if (text.toLowerCase().includes("already") || res.status === 409) {
        console.log("Storage bucket documents already exists");
      } else {
        console.log("Storage bucket create response:", res.status, text);
      }
    }
  }

  await sql.end();
  console.log("All migrations complete.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(error);
  if (
    /ECONNREFUSED|ENETUNREACH|ENOTFOUND|fetch failed|tenant\/user|password authentication/i.test(
      message,
    )
  ) {
    console.error(
      [
        "",
        "Migration could not reach Postgres.",
        "Set SESSION_POOLER_URL to the Supabase Session pooler URI, then retry.",
        "",
      ].join("\n"),
    );
  }
  process.exit(1);
});
