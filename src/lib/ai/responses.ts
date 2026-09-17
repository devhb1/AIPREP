import { cacheGet, cacheSet, cacheKey, hashContent } from "@/lib/cache/ai-cache";
import { getOpenAI } from "./client";
import { MODELS } from "./models";
import { logAiUsage } from "./usage";

export async function chatCompletion(params: {
  system: string;
  user: string;
  model?: string;
  userId?: string | null;
  workspaceId?: string | null;
  feature?: string;
  temperature?: number;
  useCache?: boolean;
}) {
  const model = params.model ?? MODELS.fast;
  const cachePayload = `${model}|${params.system}|${params.user}`;
  const key = cacheKey(["ai", "chat", hashContent(cachePayload)]);

  if (params.useCache !== false) {
    const cached = await cacheGet<{ content: string }>(key);
    if (cached?.content) {
      await logAiUsage({
        userId: params.userId,
        workspaceId: params.workspaceId,
        feature: params.feature ?? "chat",
        model,
        cached: true,
        metadata: { cacheHit: true },
      });
      return { content: cached.content, cached: true };
    }
  }

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model,
    temperature: params.temperature ?? 0.2,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim() ?? "";
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;

  await cacheSet(key, { content }, 60 * 60 * 6);
  await logAiUsage({
    userId: params.userId,
    workspaceId: params.workspaceId,
    feature: params.feature ?? "chat",
    model,
    inputTokens,
    outputTokens,
    cached: false,
  });

  return { content, cached: false, inputTokens, outputTokens };
}
