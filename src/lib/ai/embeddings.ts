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
  const embeddings: number[][] = [];
  let cachedCount = 0;
  let inputTokens = 0;

  for (const text of params.texts) {
    const key = cacheKey(["ai", "embed", MODELS.embedding, hashContent(text)]);
    const cached = await cacheGet<number[]>(key);
    if (cached) {
      embeddings.push(cached);
      cachedCount += 1;
      continue;
    }

    const response = await openai.embeddings.create({
      model: MODELS.embedding,
      input: text,
    });
    const vector = response.data[0]?.embedding ?? [];
    embeddings.push(vector);
    inputTokens += response.usage?.total_tokens ?? Math.ceil(text.length / 4);
    await cacheSet(key, vector, 60 * 60 * 24 * 7);
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

  return embeddings;
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
