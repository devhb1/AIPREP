import { Redis } from "@upstash/redis";

let redisClient: Redis | null = null;

export function getRedis() {
  if (redisClient) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required");
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

export async function redisSafe<T>(
  fn: (redis: Redis) => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn(getRedis());
  } catch {
    return fallback;
  }
}
