import "dotenv/config";
import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }

  const withSsl = url.includes("sslmode=")
    ? url
    : `${url}${url.includes("?") ? "&" : "?"}sslmode=require`;

  const sql = postgres(withSsl, { prepare: false, max: 1, ssl: "require" });
  const dir = resolve(process.cwd(), "db/migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(
    "Tip: use Supabase Session pooler DATABASE_URL (IPv4) if direct db host fails.",
  );

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
  console.error(error);
  process.exit(1);
});
