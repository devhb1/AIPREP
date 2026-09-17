import { db } from "@/lib/db";
import { aiUsageEvents } from "@/lib/db/schema";
import { estimateCostUsd } from "./models";
import { bumpDailySpendCache } from "@/lib/analytics/usage";

export async function logAiUsage(params: {
  userId?: string | null;
  workspaceId?: string | null;
  feature: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cached?: boolean;
  metadata?: Record<string, unknown>;
}) {
  const inputTokens = params.inputTokens ?? 0;
  const outputTokens = params.outputTokens ?? 0;
  const estimatedCostUsd = params.cached
    ? 0
    : estimateCostUsd({
        model: params.model,
        inputTokens,
        outputTokens,
      });

  await db.insert(aiUsageEvents).values({
    userId: params.userId ?? null,
    workspaceId: params.workspaceId ?? null,
    feature: params.feature,
    model: params.model,
    inputTokens,
    outputTokens,
    estimatedCostUsd,
    cached: params.cached ?? false,
    metadata: params.metadata ?? {},
  });

  if (params.workspaceId && estimatedCostUsd > 0) {
    await bumpDailySpendCache({
      workspaceId: params.workspaceId,
      amountUsd: estimatedCostUsd,
    });
  }

  return { estimatedCostUsd };
}
