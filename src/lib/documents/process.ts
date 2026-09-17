import { eq } from "drizzle-orm";
import { db, sql } from "@/lib/db";
import {
  documentChunks,
  documentPages,
  documents,
  jobs,
} from "@/lib/db/schema";
import { embedTexts } from "@/lib/ai/embeddings";
import { createAdminClient } from "@/lib/supabase/admin";
import { chunkText, extractPdfText } from "./parse";

export async function processDocumentJob(jobId: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) throw new Error("Job not found");
  if (job.status === "completed") return job;

  const documentId = String(job.payload?.documentId ?? "");
  if (!documentId) throw new Error("Job missing documentId");

  await db
    .update(jobs)
    .set({
      status: "running",
      startedAt: new Date(),
      attempts: (job.attempts ?? 0) + 1,
    })
    .where(eq(jobs.id, jobId));

  await db
    .update(documents)
    .set({ status: "processing", updatedAt: new Date(), errorMessage: null })
    .where(eq(documents.id, documentId));

  try {
    const [doc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);
    if (!doc) throw new Error("Document not found");

    const admin = createAdminClient();
    const { data: file, error } = await admin.storage
      .from("documents")
      .download(doc.storagePath);
    if (error || !file) throw new Error(error?.message ?? "Failed to download file");

    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = await extractPdfText(buffer);

    await db.delete(documentPages).where(eq(documentPages.documentId, documentId));
    await db.delete(documentChunks).where(eq(documentChunks.documentId, documentId));

    if (extracted.pages.length) {
      await db.insert(documentPages).values(
        extracted.pages.map((page) => ({
          documentId,
          pageNumber: page.pageNumber,
          content: page.content,
        })),
      );
    }

    const allChunks = extracted.pages.flatMap((page) =>
      chunkText(page.content, page.pageNumber),
    );

    if (allChunks.length === 0) {
      throw new Error("No extractable text found in PDF");
    }

    const embeddings = await embedTexts({
      texts: allChunks.map((c) => c.content),
      userId: doc.userId,
      workspaceId: doc.workspaceId,
      feature: "document_embed",
    });

    for (let i = 0; i < allChunks.length; i += 1) {
      const chunk = allChunks[i]!;
      const embedding = embeddings[i] ?? [];
      const vectorLiteral = `[${embedding.join(",")}]`;
      await sql`
        INSERT INTO document_chunks (
          id, document_id, workspace_id, page_number, chunk_index, content,
          token_estimate, embedding, content_hash, created_at
        ) VALUES (
          gen_random_uuid(),
          ${documentId},
          ${doc.workspaceId},
          ${chunk.pageNumber},
          ${chunk.chunkIndex},
          ${chunk.content},
          ${chunk.tokenEstimate},
          ${sql.unsafe(`'${vectorLiteral}'::vector`)},
          ${chunk.contentHash},
          now()
        )
      `;
    }

    await db
      .update(documents)
      .set({
        status: "ready",
        pageCount: extracted.pageCount,
        updatedAt: new Date(),
        metadata: {
          chunkCount: allChunks.length,
          extractedChars: extracted.text.length,
        },
      })
      .where(eq(documents.id, documentId));

    await db
      .update(jobs)
      .set({
        status: "completed",
        finishedAt: new Date(),
        result: { chunkCount: allChunks.length, pageCount: extracted.pageCount },
      })
      .where(eq(jobs.id, jobId));

    return { ok: true, chunkCount: allChunks.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Processing failed";
    await db
      .update(documents)
      .set({ status: "failed", errorMessage: message, updatedAt: new Date() })
      .where(eq(documents.id, documentId));
    await db
      .update(jobs)
      .set({
        status: "failed",
        errorMessage: message,
        finishedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
    throw error;
  }
}
