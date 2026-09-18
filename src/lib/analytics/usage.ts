import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiUsageEvents, workspaceSettings } from "@/lib/db/schema";
import { redisSafe } from "@/lib/redis";
import { DEFAULT_DAILY_AI_USD, DEFAULT_DAILY_VOICE_USD } from "@/lib/budget";

function startOfUtcDay(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function getWorkspaceDailySpendUsd(workspaceId: string) {
  const start = startOfUtcDay();
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${aiUsageEvents.estimatedCostUsd}), 0)`,
    })
    .from(aiUsageEvents)
    .where(
      and(
        eq(aiUsageEvents.workspaceId, workspaceId),
        gte(aiUsageEvents.createdAt, start),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

export async function getUsageSummary(params: {
  workspaceId: string;
  userId?: string;
}) {
  const start = startOfUtcDay();
  const week = new Date();
  week.setUTCDate(week.getUTCDate() - 7);

  const [todayRows, weekRows, byFeature, voiceToday] = await Promise.all([
    db
      .select({
        total: sql<number>`coalesce(sum(${aiUsageEvents.estimatedCostUsd}), 0)`,
        calls: sql<number>`count(*)::int`,
      })
      .from(aiUsageEvents)
      .where(
        and(
          eq(aiUsageEvents.workspaceId, params.workspaceId),
          gte(aiUsageEvents.createdAt, start),
        ),
      ),
    db
      .select({
        total: sql<number>`coalesce(sum(${aiUsageEvents.estimatedCostUsd}), 0)`,
        calls: sql<number>`count(*)::int`,
      })
      .from(aiUsageEvents)
      .where(
        and(
          eq(aiUsageEvents.workspaceId, params.workspaceId),
          gte(aiUsageEvents.createdAt, week),
        ),
      ),
    db
      .select({
        feature: aiUsageEvents.feature,
        total: sql<number>`coalesce(sum(${aiUsageEvents.estimatedCostUsd}), 0)`,
        calls: sql<number>`count(*)::int`,
      })
      .from(aiUsageEvents)
      .where(
        and(
          eq(aiUsageEvents.workspaceId, params.workspaceId),
          gte(aiUsageEvents.createdAt, week),
        ),
      )
      .groupBy(aiUsageEvents.feature),
    db
      .select({
        total: sql<number>`coalesce(sum(${aiUsageEvents.estimatedCostUsd}), 0)`,
        calls: sql<number>`count(*)::int`,
      })
      .from(aiUsageEvents)
      .where(
        and(
          eq(aiUsageEvents.workspaceId, params.workspaceId),
          gte(aiUsageEvents.createdAt, start),
          sql`(
          ${aiUsageEvents.feature} like 'realtime%'
          OR ${aiUsageEvents.feature} like 'voice%'
          OR ${aiUsageEvents.feature} = 'interview_evaluate'
        )`,
        ),
      ),
  ]);

  const settings = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, params.workspaceId))
    .limit(1);

  const extra = (settings[0]?.settings as Record<string, unknown> | null) ?? {};
  const maxDailyVoiceSpendUsd = Number(extra.maxDailyVoiceSpendUsd ?? DEFAULT_DAILY_VOICE_USD);

  return {
    todaySpendUsd: Number(todayRows[0]?.total ?? 0),
    todayCalls: Number(todayRows[0]?.calls ?? 0),
    weekSpendUsd: Number(weekRows[0]?.total ?? 0),
    weekCalls: Number(weekRows[0]?.calls ?? 0),
    todayVoiceSpendUsd: Number(voiceToday[0]?.total ?? 0),
    todayVoiceCalls: Number(voiceToday[0]?.calls ?? 0),
    byFeature: byFeature.map((row) => ({
      feature: row.feature,
      totalUsd: Number(row.total ?? 0),
      calls: Number(row.calls ?? 0),
    })),
    maxDailyAiSpendUsd: settings[0]?.maxDailyAiSpendUsd ?? DEFAULT_DAILY_AI_USD,
    maxDailyVoiceSpendUsd,
  };
}

export async function assertWithinDailyBudget(params: {
  workspaceId: string;
  userId: string;
}) {
  const settings = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, params.workspaceId))
    .limit(1);

  const maxDaily = settings[0]?.maxDailyAiSpendUsd ?? DEFAULT_DAILY_AI_USD;
  const redisKey = `spend:${params.workspaceId}:${startOfUtcDay().toISOString().slice(0, 10)}`;

  const cached = await redisSafe(async (redis) => {
    const value = await redis.get<number>(redisKey);
    return value;
  }, null);

  const spent = cached ?? (await getWorkspaceDailySpendUsd(params.workspaceId));

  if (cached == null) {
    await redisSafe(async (redis) => {
      await redis.set(redisKey, spent, { ex: 60 * 60 * 26 });
      return true;
    }, false);
  }

  if (spent >= maxDaily) {
    throw new Error(
      `Daily AI spend cap reached ($${spent.toFixed(4)} / $${maxDaily}). Resets at 00:00 UTC. Raise the cap in Settings if you need more today.`,
    );
  }

  return { spent, maxDaily };
}

export async function assertWithinVoiceBudget(params: {
  workspaceId: string;
  userId: string;
}) {
  await assertWithinDailyBudget(params);

  const settings = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, params.workspaceId))
    .limit(1);
  const extra = (settings[0]?.settings as Record<string, unknown> | null) ?? {};
  const maxVoice = Number(extra.maxDailyVoiceSpendUsd ?? DEFAULT_DAILY_VOICE_USD);

  const start = startOfUtcDay();
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${aiUsageEvents.estimatedCostUsd}), 0)`,
    })
    .from(aiUsageEvents)
    .where(
      and(
        eq(aiUsageEvents.workspaceId, params.workspaceId),
        gte(aiUsageEvents.createdAt, start),
        sql`(
          ${aiUsageEvents.feature} like 'realtime%'
          OR ${aiUsageEvents.feature} like 'voice%'
          OR ${aiUsageEvents.feature} = 'interview_evaluate'
        )`,
      ),
    );
  const spent = Number(rows[0]?.total ?? 0);
  if (spent >= maxVoice) {
    throw new Error(
      `Daily voice budget reached ($${spent.toFixed(4)} / $${maxVoice}). Raise voice cap in Settings.`,
    );
  }
  return { spent, maxVoice };
}

export async function bumpDailySpendCache(params: {
  workspaceId: string;
  amountUsd: number;
}) {
  const redisKey = `spend:${params.workspaceId}:${startOfUtcDay().toISOString().slice(0, 10)}`;
  await redisSafe(async (redis) => {
    const current = (await redis.get<number>(redisKey)) ?? 0;
    await redis.set(redisKey, current + params.amountUsd, { ex: 60 * 60 * 26 });
    return true;
  }, false);
}
