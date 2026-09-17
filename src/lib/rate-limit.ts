import { redisSafe } from "./redis";

export async function rateLimit(params: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<{ allowed: boolean; remaining: number }> {
  const fullKey = `rl:${params.key}`;

  return redisSafe(
    async (redis) => {
      const count = await redis.incr(fullKey);
      if (count === 1) {
        await redis.expire(fullKey, params.windowSeconds);
      }
      return {
        allowed: count <= params.limit,
        remaining: Math.max(params.limit - count, 0),
      };
    },
    { allowed: true, remaining: params.limit },
  );
}
