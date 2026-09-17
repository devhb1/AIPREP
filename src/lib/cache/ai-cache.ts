import { createHash } from "crypto";
import { redisSafe } from "@/lib/redis";

export function cacheKey(parts: Array<string | number>) {
  return parts.join(":");
}

export function hashContent(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  return redisSafe(async (redis) => {
    const value = await redis.get<T>(key);
    return value ?? null;
  }, null);
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 60 * 60 * 24) {
  await redisSafe(async (redis) => {
    await redis.set(key, value, { ex: ttlSeconds });
    return true;
  }, false);
}

export async function enqueueJob(queue: string, jobId: string) {
  await redisSafe(async (redis) => {
    await redis.lpush(queue, jobId);
    return true;
  }, false);
}

export async function dequeueJob(queue: string): Promise<string | null> {
  return redisSafe(async (redis) => {
    const value = await redis.rpop<string>(queue);
    return value ?? null;
  }, null);
}
