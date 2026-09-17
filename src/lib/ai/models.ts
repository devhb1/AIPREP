export const MODELS = {
  fast: process.env.FAST_MODEL || "gpt-4.1-mini",
  reasoning: process.env.REASONING_MODEL || "gpt-4.1",
  embedding: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
} as const;

/** Rough USD estimates for cost tracking — tune as pricing changes */
export const MODEL_COST_PER_1M = {
  [MODELS.fast]: { input: 0.4, output: 1.6 },
  [MODELS.reasoning]: { input: 2.0, output: 8.0 },
  [MODELS.embedding]: { input: 0.02, output: 0 },
} as const;

export function estimateCostUsd(params: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const rates = MODEL_COST_PER_1M[params.model as keyof typeof MODEL_COST_PER_1M] ?? {
    input: 1,
    output: 3,
  };
  return (
    (params.inputTokens / 1_000_000) * rates.input +
    (params.outputTokens / 1_000_000) * rates.output
  );
}
