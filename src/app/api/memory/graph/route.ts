import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  claims,
  documents,
  memoryItems,
  memoryLinks,
  personalStories,
  workspaces,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";

export type GraphNode = {
  id: string;
  kind: "document" | "claim" | "memory" | "note" | "story" | "topic";
  column: "documents" | "claims" | "topics" | "notes";
  label: string;
  status?: string | null;
};

export type GraphEdge = {
  from: string;
  to: string;
  type: string;
};

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }

  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, user.id)))
    .limit(1);
  if (!workspace) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [docs, inbox, memories, stories, links] = await Promise.all([
    db
      .select({
        id: documents.id,
        title: documents.title,
        status: documents.status,
      })
      .from(documents)
      .where(eq(documents.workspaceId, workspaceId))
      .limit(40),
    db
      .select({
        id: claims.id,
        statement: claims.statement,
        status: claims.status,
        topic: claims.topic,
      })
      .from(claims)
      .where(
        and(
          eq(claims.workspaceId, workspaceId),
          eq(claims.status, "CANDIDATE"),
        ),
      )
      .limit(40),
    db
      .select({
        id: memoryItems.id,
        title: memoryItems.title,
        content: memoryItems.content,
        status: memoryItems.status,
        topicId: memoryItems.topicId,
        sourceKind: memoryItems.sourceKind,
        namespace: memoryItems.namespace,
      })
      .from(memoryItems)
      .where(
        and(eq(memoryItems.workspaceId, workspaceId), isNull(memoryItems.deletedAt)),
      )
      .limit(80),
    db
      .select({
        id: personalStories.id,
        title: personalStories.title,
      })
      .from(personalStories)
      .where(eq(personalStories.workspaceId, workspaceId))
      .limit(20),
    db
      .select()
      .from(memoryLinks)
      .where(eq(memoryLinks.workspaceId, workspaceId))
      .limit(200),
  ]);

  const nodes: GraphNode[] = [];
  const topicSet = new Set<string>();

  for (const doc of docs) {
    nodes.push({
      id: `doc:${doc.id}`,
      kind: "document",
      column: "documents",
      label: doc.title || "PDF",
      status: doc.status,
    });
  }

  for (const claim of inbox) {
    nodes.push({
      id: `claim:${claim.id}`,
      kind: "claim",
      column: "claims",
      label: claim.statement.slice(0, 80),
      status: claim.status,
    });
    if (claim.topic) topicSet.add(claim.topic);
  }

  for (const memory of memories) {
    const isNote =
      memory.status === "PERSONAL_NOTE" || memory.sourceKind === "note";
    nodes.push({
      id: `mem:${memory.id}`,
      kind: isNote ? "note" : "memory",
      column: isNote ? "notes" : "claims",
      label: (memory.title || memory.content).slice(0, 80),
      status: memory.status,
    });
    if (memory.topicId) topicSet.add(memory.topicId);
  }

  for (const story of stories) {
    nodes.push({
      id: `story:${story.id}`,
      kind: "story",
      column: "notes",
      label: story.title,
    });
  }

  for (const topic of topicSet) {
    nodes.push({
      id: `topic:${topic}`,
      kind: "topic",
      column: "topics",
      label: topic,
    });
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: GraphEdge[] = [];

  for (const claim of inbox) {
    if (!claim.topic) continue;
    const from = `claim:${claim.id}`;
    const to = `topic:${claim.topic}`;
    if (nodeIds.has(from) && nodeIds.has(to)) {
      edges.push({ from, to, type: "topic" });
    }
  }

  for (const memory of memories) {
    if (!memory.topicId) continue;
    const from = `mem:${memory.id}`;
    const to = `topic:${memory.topicId}`;
    if (nodeIds.has(from) && nodeIds.has(to)) {
      edges.push({ from, to, type: "topic" });
    }
  }

  for (const link of links) {
    const from = `mem:${link.fromMemoryId}`;
    const to = link.toMemoryId
      ? `mem:${link.toMemoryId}`
      : link.topic
        ? `topic:${link.topic}`
        : null;
    if (!to || !nodeIds.has(from) || !nodeIds.has(to) || from === to) continue;
    edges.push({ from, to, type: link.linkType });
  }

  const capped = nodes.slice(0, 150);
  const kept = new Set(capped.map((n) => n.id));

  return NextResponse.json({
    nodes: capped,
    edges: edges.filter((e) => kept.has(e.from) && kept.has(e.to)).slice(0, 220),
  });
}
