import { cacheGet, cacheSet, cacheKey, hashContent } from "@/lib/cache/ai-cache";
import { getOpenAI } from "./client";
import { MODELS } from "./models";
import { logAiUsage } from "./usage";

export async function embedTexts(params: {
  texts: string[];
  userId?: string | null;
  workspaceId?: string | null;
  feature?: string;
}) {
  const openai = getOpenAI();
  const embeddings: Array<number[] | null> = new Array(params.texts.length).fill(null);
  let cachedCount = 0;
  let inputTokens = 0;

  const pending: Array<{ index: number; text: string }> = [];

  for (let i = 0; i < params.texts.length; i += 1) {
    const text = params.texts[i]!;
    const key = cacheKey(["ai", "embed", MODELS.embedding, hashContent(text)]);
    const cached = await cacheGet<number[]>(key);
    if (cached) {
      embeddings[i] = cached;
      cachedCount += 1;
    } else {
      pending.push({ index: i, text });
    }
  }

  // Batch uncached texts (much faster than one request per chunk).
  const BATCH = 64;
  for (let offset = 0; offset < pending.length; offset += BATCH) {
    const batch = pending.slice(offset, offset + BATCH);
    const response = await openai.embeddings.create({
      model: MODELS.embedding,
      input: batch.map((b) => b.text),
    });
    inputTokens += response.usage?.total_tokens ?? 0;
    for (let j = 0; j < batch.length; j += 1) {
      const vector = response.data[j]?.embedding ?? [];
      const item = batch[j]!;
      embeddings[item.index] = vector;
      const key = cacheKey([
        "ai",
        "embed",
        MODELS.embedding,
        hashContent(item.text),
      ]);
      await cacheSet(key, vector, 60 * 60 * 24 * 7);
    }
  }

  await logAiUsage({
    userId: params.userId,
    workspaceId: params.workspaceId,
    feature: params.feature ?? "embed",
    model: MODELS.embedding,
    inputTokens,
    outputTokens: 0,
    cached: cachedCount === params.texts.length && params.texts.length > 0,
    metadata: { texts: params.texts.length, cachedCount },
  });

  return embeddings.map((v) => v ?? []);
}

export async function embedQuery(params: {
  text: string;
  userId?: string | null;
  workspaceId?: string | null;
}) {
  const [vector] = await embedTexts({
    texts: [params.text],
    userId: params.userId,
    workspaceId: params.workspaceId,
    feature: "embed_query",
  });
  return vector;
}
