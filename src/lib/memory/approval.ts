import { createHash } from "crypto";
import { and, eq, isNull, ne } from "drizzle-orm";
import { db, sql } from "@/lib/db";
import {
  claims,
  memoryItems,
  memoryLinks,
  memoryVersions,
} from "@/lib/db/schema";
import { embedTexts } from "@/lib/ai/embeddings";

export async function approveClaim(params: {
  claimId: string;
  userId: string;
  workspaceId: string;
  mode?: "trusted" | "unconfirmed" | "note";
}) {
  const [claim] = await db
    .select()
    .from(claims)
    .where(
      and(eq(claims.id, params.claimId), eq(claims.workspaceId, params.workspaceId)),
    )
    .limit(1);
  if (!claim) throw new Error("Claim not found");

  const status =
    params.mode === "unconfirmed"
      ? "UNCONFIRMED"
      : params.mode === "note"
        ? "PERSONAL_NOTE"
        : "USER_APPROVED";
  const namespace =
    params.mode === "note"
      ? "preferences"
      : params.mode === "unconfirmed"
        ? "candidate"
        : "trusted";

  await db
    .update(claims)
    .set({ status, updatedAt: new Date() })
    .where(eq(claims.id, claim.id));

  const [memory] = await db
    .insert(memoryItems)
    .values({
      workspaceId: params.workspaceId,
      userId: params.userId,
      claimId: claim.id,
      namespace,
      title: claim.topic ?? "Approved claim",
      content: claim.statement,
      status,
      version: 1,
      metadata: {
        confidence: claim.confidence,
        assessment: claim.assessment,
      },
      sourceKind: "claim",
      topicId: claim.topic ?? null,
      votes: 0,
    })
    .returning();

  await db.insert(memoryVersions).values({
    memoryId: memory.id,
    version: 1,
    content: memory.content,
    status,
  });

  await writeMemoryLinks({
    workspaceId: params.workspaceId,
    memoryId: memory.id,
    topic: claim.topic,
  });

  if (namespace === "trusted") {
    const [embedding] = await embedTexts({
      texts: [memory.content],
      userId: params.userId,
      workspaceId: params.workspaceId,
      feature: "memory_embed",
    });
    const vectorLiteral = `[${(embedding ?? []).join(",")}]`;
    const contentHash = createHash("sha256").update(memory.content).digest("hex");
    await sql`
      INSERT INTO memory_embeddings (id, memory_id, workspace_id, content_hash, embedding, created_at)
      VALUES (
        gen_random_uuid(),
        ${memory.id},
        ${params.workspaceId},
        ${contentHash},
        ${sql.unsafe(`'${vectorLiteral}'::vector`)},
        now()
      )
    `;
  }

  return memory;
}

async function writeMemoryLinks(params: {
  workspaceId: string;
  memoryId: string;
  topic: string | null;
}) {
  const topic = params.topic?.trim();
  if (!topic) return;

  await db.insert(memoryLinks).values({
    workspaceId: params.workspaceId,
    fromMemoryId: params.memoryId,
    linkType: "topic",
    topic,
  });

  const siblings = await db
    .select({ id: memoryItems.id })
    .from(memoryItems)
    .where(
      and(
        eq(memoryItems.workspaceId, params.workspaceId),
        eq(memoryItems.topicId, topic),
        isNull(memoryItems.deletedAt),
        ne(memoryItems.id, params.memoryId),
      ),
    )
    .limit(5);

  if (siblings.length === 0) return;

  await db.insert(memoryLinks).values(
    siblings.map((row) => ({
      workspaceId: params.workspaceId,
      fromMemoryId: params.memoryId,
      toMemoryId: row.id,
      linkType: "related",
      topic,
    })),
  );
}

export async function rejectClaim(params: {
  claimId: string;
  workspaceId: string;
}) {
  const [claim] = await db
    .select()
    .from(claims)
    .where(
      and(eq(claims.id, params.claimId), eq(claims.workspaceId, params.workspaceId)),
    )
    .limit(1);
  if (!claim) throw new Error("Claim not found");

  await db
    .update(claims)
    .set({ status: "REJECTED", updatedAt: new Date() })
    .where(eq(claims.id, claim.id));

  return claim;
}

export async function listPendingClaims(workspaceId: string) {
  return db
    .select()
    .from(claims)
    .where(
      and(
        eq(claims.workspaceId, workspaceId),
        eq(claims.status, "CANDIDATE"),
      ),
    );
}
