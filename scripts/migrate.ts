import "dotenv/config";
import { readFileSync } from "fs";
import { resolve } from "path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  const sql = postgres(url, { prepare: false, max: 1 });
  const migrationPath = resolve(process.cwd(), "db/migrations/001_phase1.sql");
  const migration = readFileSync(migrationPath, "utf8");

  console.log("Running Phase 1 migration...");
  console.log(
    "Tip: if auth fails, use Supabase Session pooler DATABASE_URL (IPv4), not direct db.*.supabase.co.",
  );
  await sql.unsafe(migration);
  console.log("Migration complete.");

  // Ensure storage bucket exists
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
