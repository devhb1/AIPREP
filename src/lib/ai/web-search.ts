import { cacheGet, cacheSet, cacheKey, hashContent } from "@/lib/cache/ai-cache";
import { getOpenAI } from "./client";
import { MODELS } from "./models";
import { logAiUsage } from "./usage";

export type WebSearchHit = {
  title: string;
  url: string;
  snippet: string;
  publisher?: string;
};

export async function webResearch(params: {
  query: string;
  userId?: string | null;
  workspaceId?: string | null;
  feature?: string;
}): Promise<{ text: string; hits: WebSearchHit[]; cached: boolean }> {
  const key = cacheKey([
    "ai",
    "web_research",
    MODELS.reasoning,
    hashContent(params.query),
  ]);
  const cached = await cacheGet<{ text: string; hits: WebSearchHit[] }>(key);
  if (cached) {
    await logAiUsage({
      userId: params.userId,
      workspaceId: params.workspaceId,
      feature: params.feature ?? "web_research",
      model: MODELS.reasoning,
      cached: true,
      metadata: { query: params.query },
    });
    return { ...cached, cached: true };
  }

  const openai = getOpenAI();
  const response = await openai.responses.create({
    model: MODELS.reasoning,
    tools: [{ type: "web_search" }],
    input: `Research this carefully for an Indian government teaching interview candidate.
Return factual, source-backed notes only. Prefer official .gov.in / organizational pages.
Query: ${params.query}`,
  });

  const text = response.output_text?.trim() ?? "";
  const hits: WebSearchHit[] = [];

  for (const item of response.output ?? []) {
    if (item.type === "web_search_call") continue;
    if (item.type === "message") {
      for (const part of item.content ?? []) {
        if (part.type === "output_text") {
          const annotations = part.annotations ?? [];
          for (const ann of annotations) {
            if (ann.type === "url_citation") {
              hits.push({
                title: ann.title || "Source",
                url: ann.url,
                snippet: text.slice(0, 400),
                publisher: (() => {
                  try {
                    return new URL(ann.url).hostname;
                  } catch {
                    return undefined;
                  }
                })(),
              });
            }
          }
        }
      }
    }
  }

  const uniqueHits = hits.filter(
    (hit, index, arr) => hit.url && arr.findIndex((h) => h.url === hit.url) === index,
  );

  const payload = { text, hits: uniqueHits };
  await cacheSet(key, payload, 60 * 60 * 12);
  await logAiUsage({
    userId: params.userId,
    workspaceId: params.workspaceId,
    feature: params.feature ?? "web_research",
    model: MODELS.reasoning,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    cached: false,
    metadata: { query: params.query, hitCount: uniqueHits.length },
  });

  return { ...payload, cached: false };
}
