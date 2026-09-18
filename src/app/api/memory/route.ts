import { NextResponse } from "next/server";
import { and, desc, eq, inArray, isNull, sql as dsql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  claims,
  claimSources,
  documents,
  memoryItems,
  memoryLinks,
  personalStories,
  sources,
  workspaces,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { approveClaim, rejectClaim } from "@/lib/memory/approval";
import { invalidateNba } from "@/lib/cache/ai-cache";

async function assertWorkspace(userId: string, workspaceId: string) {
  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)))
    .limit(1);
  return workspace ?? null;
}

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  const tab = searchParams.get("tab") ?? "all";
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }

  const workspace = await assertWorkspace(user.id, workspaceId);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Counts + topics in a tight parallel batch (single pooled connection queues them).
  const [countRows, topicRows, memoryTopics] = await Promise.all([
    db.execute(dsql`
      select
        (select count(*)::int from claims
          where workspace_id = ${workspaceId}::uuid
            and status in ('CANDIDATE','CONFLICTING')) as scraped,
        (select count(*)::int from memory_items
          where workspace_id = ${workspaceId}::uuid
            and deleted_at is null
            and status = 'USER_APPROVED') as approved,
        (select count(*)::int from memory_items
          where workspace_id = ${workspaceId}::uuid
            and deleted_at is null
            and (status = 'PERSONAL_NOTE' or source_kind = 'note')) as notes,
        (select count(*)::int from personal_stories
          where workspace_id = ${workspaceId}::uuid) as stories,
        (select count(*)::int from documents
          where workspace_id = ${workspaceId}::uuid) as documents
    `),
    db
      .select({
        topic: claims.topic,
        count: dsql<number>`count(*)::int`,
      })
      .from(claims)
      .where(
        and(
          eq(claims.workspaceId, workspaceId),
          dsql`${claims.topic} is not null`,
        ),
      )
      .groupBy(claims.topic)
      .limit(20),
    db
      .select({
        topicId: memoryItems.topicId,
        count: dsql<number>`count(*)::int`,
      })
      .from(memoryItems)
      .where(
        and(
          eq(memoryItems.workspaceId, workspaceId),
          isNull(memoryItems.deletedAt),
          dsql`${memoryItems.topicId} is not null`,
        ),
      )
      .groupBy(memoryItems.topicId)
      .limit(20),
  ]);

  const countsRaw = (countRows as unknown as Array<Record<string, number>>)[0] ?? {};
  const counts = {
    scraped: Number(countsRaw.scraped ?? 0),
    approved: Number(countsRaw.approved ?? 0),
    notes: Number(countsRaw.notes ?? 0),
    stories: Number(countsRaw.stories ?? 0),
    documents: Number(countsRaw.documents ?? 0),
    all: 0,
  };
  counts.all =
    counts.scraped +
    counts.approved +
    counts.notes +
    counts.stories +
    counts.documents;

  const mergedTopics = new Map<
    string,
    { topic: string; claimCount: number; memoryCount: number }
  >();
  for (const t of topicRows) {
    if (!t.topic) continue;
    mergedTopics.set(t.topic, {
      topic: t.topic,
      claimCount: Number(t.count),
      memoryCount: 0,
    });
  }
  for (const t of memoryTopics) {
    if (!t.topicId) continue;
    const prev = mergedTopics.get(t.topicId) ?? {
      topic: t.topicId,
      claimCount: 0,
      memoryCount: 0,
    };
    prev.memoryCount += Number(t.count);
    mergedTopics.set(t.topicId, prev);
  }

  let ledger: Array<Record<string, unknown>> = [];

  if (tab === "scraped" || tab === "all") {
    const inboxClaims = await db
      .select()
      .from(claims)
      .where(
        and(
          eq(claims.workspaceId, workspaceId),
          inArray(claims.status, ["CANDIDATE", "CONFLICTING"]),
        ),
      )
      .orderBy(desc(claims.createdAt))
      .limit(tab === "all" ? 20 : 40);

    const claimIds = inboxClaims.map((c) => c.id);
    const allSourceLinks =
      claimIds.length === 0
        ? []
        : await db
            .select({
              claimId: claimSources.claimId,
              title: sources.title,
              url: sources.url,
              sourceType: sources.sourceType,
              qualityScore: sources.qualityScore,
              excerpt: claimSources.excerpt,
            })
            .from(claimSources)
            .leftJoin(sources, eq(sources.id, claimSources.sourceId))
            .where(inArray(claimSources.claimId, claimIds));

    const sourcesByClaim = new Map<string, typeof allSourceLinks>();
    for (const link of allSourceLinks) {
      const list = sourcesByClaim.get(link.claimId) ?? [];
      list.push(link);
      sourcesByClaim.set(link.claimId, list);
    }

    ledger = [
      ...ledger,
      ...inboxClaims.map((claim) => ({
        ...claim,
        sources: sourcesByClaim.get(claim.id) ?? [],
        kind: "claim" as const,
        ledgerKind: "scraped",
      })),
    ];
  }

  if (tab === "approved" || tab === "notes" || tab === "all") {
    const memory = await db
      .select()
      .from(memoryItems)
      .where(and(eq(memoryItems.workspaceId, workspaceId), isNull(memoryItems.deletedAt)))
      .orderBy(desc(memoryItems.updatedAt))
      .limit(60);

    if (tab === "approved" || tab === "all") {
      ledger = [
        ...ledger,
        ...memory
          .filter((m) => m.status === "USER_APPROVED" || m.namespace === "trusted")
          .map((m) => ({ ...m, ledgerKind: "approved", kind: "memory" })),
      ];
    }
    if (tab === "notes" || tab === "all") {
      ledger = [
        ...ledger,
        ...memory
          .filter(
            (m) =>
              m.status === "PERSONAL_NOTE" ||
              m.namespace === "preferences" ||
              m.sourceKind === "note",
          )
          .map((m) => ({ ...m, ledgerKind: "notes", kind: "memory" })),
      ];
    }
  }

  if (tab === "stories" || tab === "all") {
    const stories = await db
      .select()
      .from(personalStories)
      .where(eq(personalStories.workspaceId, workspaceId))
      .orderBy(desc(personalStories.createdAt))
      .limit(30);
    ledger = [
      ...ledger,
      ...stories.map((s) => ({
        ...s,
        ledgerKind: "stories",
        kind: "story",
        content: s.content,
        title: s.title,
      })),
    ];
  }

  if (tab === "documents" || tab === "all") {
    const docs = await db
      .select({
        id: documents.id,
        title: documents.title,
        status: documents.status,
        pageCount: documents.pageCount,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(eq(documents.workspaceId, workspaceId))
      .orderBy(desc(documents.createdAt))
      .limit(30);
    ledger = [
      ...ledger,
      ...docs.map((d) => ({
        ...d,
        ledgerKind: "documents",
        kind: "document",
        content: d.title,
        title: d.title,
      })),
    ];
  }

  return NextResponse.json({
    tab,
    ledger,
    topics: Array.from(mergedTopics.values()).sort(
      (a, b) => b.claimCount + b.memoryCount - (a.claimCount + a.memoryCount),
    ),
    counts,
  });
}

const actionSchema = z.object({
  workspaceId: z.string().uuid(),
  action: z.enum([
    "approve",
    "reject",
    "upvote",
    "downvote",
    "delete",
    "add_note",
    "research_topic",
  ]),
  claimId: z.string().uuid().optional(),
  memoryId: z.string().uuid().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  topic: z.string().optional(),
});

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const workspace = await assertWorkspace(user.id, parsed.data.workspaceId);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { action, workspaceId } = parsed.data;

  if (action === "approve" || action === "reject") {
    if (!parsed.data.claimId) {
      return NextResponse.json({ error: "claimId required" }, { status: 400 });
    }
    if (action === "reject") {
      const claim = await rejectClaim({
        claimId: parsed.data.claimId,
        workspaceId,
      });
      await invalidateNba(workspaceId);
      return NextResponse.json({ claim });
    }
    const memory = await approveClaim({
      claimId: parsed.data.claimId,
      userId: user.id,
      workspaceId,
      mode: "trusted",
    });
    await invalidateNba(workspaceId);
    return NextResponse.json({ memory });
  }

  if (action === "upvote" || action === "downvote") {
    if (!parsed.data.memoryId) {
      return NextResponse.json({ error: "memoryId required" }, { status: 400 });
    }
    const [existing] = await db
      .select()
      .from(memoryItems)
      .where(
        and(
          eq(memoryItems.id, parsed.data.memoryId),
          eq(memoryItems.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const delta = action === "upvote" ? 1 : -1;
    const [row] = await db
      .update(memoryItems)
      .set({
        votes: (existing.votes ?? 0) + delta,
        updatedAt: new Date(),
      })
      .where(eq(memoryItems.id, existing.id))
      .returning();
    return NextResponse.json({ memory: row });
  }

  if (action === "delete") {
    if (!parsed.data.memoryId) {
      return NextResponse.json({ error: "memoryId required" }, { status: 400 });
    }
    const [row] = await db
      .update(memoryItems)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(memoryItems.id, parsed.data.memoryId),
          eq(memoryItems.workspaceId, workspaceId),
        ),
      )
      .returning();
    return NextResponse.json({ memory: row });
  }

  if (action === "add_note") {
    const content = parsed.data.content?.trim();
    if (!content) {
      return NextResponse.json({ error: "content required" }, { status: 400 });
    }
    const topic = parsed.data.topic?.trim() || null;
    const [row] = await db
      .insert(memoryItems)
      .values({
        workspaceId,
        userId: user.id,
        namespace: "preferences",
        title: parsed.data.title?.trim() || "My note",
        content,
        status: "PERSONAL_NOTE",
        sourceKind: "note",
        topicId: topic,
        votes: 0,
      })
      .returning();
    if (topic) {
      await db.insert(memoryLinks).values({
        workspaceId,
        fromMemoryId: row.id,
        linkType: "topic",
        topic,
      });
    }
    return NextResponse.json({ memory: row });
  }

  if (action === "research_topic") {
    const topic = parsed.data.topic?.trim();
    if (!topic) {
      return NextResponse.json({ error: "topic required" }, { status: 400 });
    }
    return NextResponse.json({
      redirect: `/workspace/${workspaceId}/research?topic=${encodeURIComponent(topic)}`,
      topic,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
