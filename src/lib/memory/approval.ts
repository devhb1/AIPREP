import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { db, sql } from "@/lib/db";
import {
  claims,
  memoryEmbeddings,
  memoryItems,
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
    })
    .returning();

  await db.insert(memoryVersions).values({
    memoryId: memory.id,
    version: 1,
    content: memory.content,
    status,
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
