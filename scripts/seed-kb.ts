import "dotenv/config";
import { readFileSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db, sql } from "../src/lib/db";
import { kbBaseEmbeddings, kbBaseItems } from "../src/lib/db/schema";
import { embedTexts } from "../src/lib/ai/embeddings";
import { DEFAULT_EXAM_KEY } from "../src/lib/rag/retrieve";

type SeedItem = {
  category: string;
  title: string;
  body: string;
  sourceUrl?: string;
  sourceTitle?: string;
};

type SeedFile = {
  examKey?: string;
  items: SeedItem[];
};

async function main() {
  const path =
    process.env.KB_SEED_SOURCE_PATH?.trim() ||
    resolve(process.cwd(), "data/kvs-prt-base-kb.json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as SeedFile;
  const examKey = raw.examKey?.trim() || DEFAULT_EXAM_KEY;
  const items = raw.items ?? [];
  if (items.length === 0) {
    throw new Error(`No items in ${path}`);
  }

  let upserts = 0;
  let embeds = 0;

  for (const item of items) {
    const category = item.category.trim();
    const title = item.title.trim();
    const body = item.body.trim();
    if (!category || !title || !body) continue;

    const [row] = await db
      .insert(kbBaseItems)
      .values({
        examKey,
        category,
        title,
        body,
        sourceUrl: item.sourceUrl ?? null,
        sourceTitle: item.sourceTitle ?? null,
        adminVerified: true,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [kbBaseItems.examKey, kbBaseItems.category, kbBaseItems.title],
        set: {
          body,
          sourceUrl: item.sourceUrl ?? null,
          sourceTitle: item.sourceTitle ?? null,
          adminVerified: true,
          updatedAt: new Date(),
        },
      })
      .returning();

    upserts += 1;

    const contentHash = createHash("sha256").update(body).digest("hex");
    const existing = await db
      .select({ id: kbBaseEmbeddings.id })
      .from(kbBaseEmbeddings)
      .where(eq(kbBaseEmbeddings.kbItemId, row.id))
      .limit(1);

    const [embedding] = await embedTexts({
      texts: [`${title}\n${body}`],
      feature: "kb_seed_embed",
    });
    const vectorLiteral = `[${(embedding ?? []).join(",")}]`;

    if (existing[0]) {
      await sql`
        DELETE FROM kb_base_embeddings WHERE kb_item_id = ${row.id}::uuid
      `;
    }

    await sql`
      INSERT INTO kb_base_embeddings (id, kb_item_id, embedding)
      VALUES (
        gen_random_uuid(),
        ${row.id}::uuid,
        ${sql.unsafe(`'${vectorLiteral}'::vector`)}
      )
    `;
    embeds += 1;
    console.log(`Seeded ${category} / ${title} (${contentHash.slice(0, 8)})`);
  }

  console.log(`Done. upserts=${upserts} embeddings=${embeds} exam=${examKey}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
