import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { claims, claimSources, sources, workspaces } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { approveClaim, rejectClaim } from "@/lib/memory/approval";
import { invalidateNba } from "@/lib/cache/ai-cache";

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  const status = searchParams.get("status") ?? "inbox";
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, user.id)))
    .limit(1);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const statuses =
    status === "inbox"
      ? ["CANDIDATE", "CONFLICTING"]
      : status === "approved"
        ? ["USER_APPROVED", "UNCONFIRMED", "PERSONAL_NOTE"]
        : [status];

  const rows = await db
    .select()
    .from(claims)
    .where(and(eq(claims.workspaceId, workspaceId), inArray(claims.status, statuses)))
    .orderBy(desc(claims.createdAt));

  const withSources = await Promise.all(
    rows.map(async (claim) => {
      const links = await db
        .select({
          sourceId: claimSources.sourceId,
          excerpt: claimSources.excerpt,
          title: sources.title,
          url: sources.url,
          sourceType: sources.sourceType,
          qualityScore: sources.qualityScore,
        })
        .from(claimSources)
        .leftJoin(sources, eq(sources.id, claimSources.sourceId))
        .where(eq(claimSources.claimId, claim.id));
      return { ...claim, sources: links };
    }),
  );

  return NextResponse.json({ claims: withSources });
}

const actionSchema = z.object({
  workspaceId: z.string().uuid(),
  claimId: z.string().uuid(),
  action: z.enum(["approve", "reject", "unconfirmed", "note"]),
});

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { workspaceId, claimId, action } = parsed.data;
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, user.id)))
    .limit(1);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "reject") {
    const claim = await rejectClaim({ claimId, workspaceId });
    await invalidateNba(workspaceId);
    return NextResponse.json({ claim });
  }

  const memory = await approveClaim({
    claimId,
    userId: user.id,
    workspaceId,
    mode:
      action === "unconfirmed"
        ? "unconfirmed"
        : action === "note"
          ? "note"
          : "trusted",
  });
  await invalidateNba(workspaceId);

  return NextResponse.json({ memory });
}
