import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  researchCampaigns,
  researchQueries,
  workspaces,
} from "@/lib/db/schema";
import { ensureProfile, requireUser } from "@/lib/auth/session";
import {
  buildKvsResearchQueries,
  runResearchCampaign,
} from "@/lib/research/campaign";
import { rateLimit } from "@/lib/rate-limit";
import { assertWithinDailyBudget } from "@/lib/analytics/usage";

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = new URL(request.url).searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, user.id)))
    .limit(1);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const campaigns = await db
    .select()
    .from(researchCampaigns)
    .where(eq(researchCampaigns.workspaceId, workspaceId))
    .orderBy(desc(researchCampaigns.createdAt));

  return NextResponse.json({ campaigns });
}

const createSchema = z.object({
  workspaceId: z.string().uuid(),
  topic: z.string().min(3).max(200).optional(),
  depth: z.enum(["quick", "standard", "deep"]).optional(),
});

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureProfile(user);

  const limited = await rateLimit({
    key: `research:${user.id}`,
    limit: 8,
    windowSeconds: 60 * 60,
  });
  if (!limited.allowed) {
    return NextResponse.json({ error: "Research rate limit exceeded" }, { status: 429 });
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { workspaceId, depth = "standard" } = parsed.data;
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, user.id)))
    .limit(1);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertWithinDailyBudget({ workspaceId, userId: user.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Budget exceeded" },
      { status: 429 },
    );
  }

  const topic = parsed.data.topic ?? `${workspace.name} preparation research`;

  const [campaign] = await db
    .insert(researchCampaigns)
    .values({
      workspaceId,
      userId: user.id,
      topic,
      depth,
      status: "queued",
    })
    .returning();

  const queries = buildKvsResearchQueries(topic);
  await db.insert(researchQueries).values(
    queries.map((q) => ({
      campaignId: campaign.id,
      cluster: q.cluster,
      query: q.query,
      status: "pending",
    })),
  );

  try {
    const result = await runResearchCampaign(campaign.id);
    const [fresh] = await db
      .select()
      .from(researchCampaigns)
      .where(eq(researchCampaigns.id, campaign.id))
      .limit(1);
    return NextResponse.json({ campaign: fresh, result });
  } catch (error) {
    return NextResponse.json(
      {
        campaign,
        error: error instanceof Error ? error.message : "Research failed",
      },
      { status: 202 },
    );
  }
}
