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
  maxTokens?: number;
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
    ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
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

/** Stream chat tokens; caller persists final content. */
export async function streamChatCompletion(params: {
  system: string;
  user: string;
  model?: string;
  userId?: string | null;
  workspaceId?: string | null;
  feature?: string;
  temperature?: number;
  onToken: (token: string) => void;
}) {
  const model = params.model ?? MODELS.fast;
  const openai = getOpenAI();
  const stream = await openai.chat.completions.create({
    model,
    temperature: params.temperature ?? 0.2,
    stream: true,
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
  });

  let content = "";
  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content ?? "";
    if (token) {
      content += token;
      params.onToken(token);
    }
  }

  await logAiUsage({
    userId: params.userId,
    workspaceId: params.workspaceId,
    feature: params.feature ?? "chat",
    model,
    inputTokens: Math.ceil((params.system.length + params.user.length) / 4),
    outputTokens: Math.ceil(content.length / 4),
    cached: false,
    metadata: { streamed: true },
  });

  return { content: content.trim(), cached: false };
}
