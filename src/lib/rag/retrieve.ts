import { sql } from "@/lib/db";
import { embedQuery } from "@/lib/ai/embeddings";

export type RetrievedChunk = {
  id: string;
  documentId: string;
  title: string;
  pageNumber: number | null;
  content: string;
  distance: number;
};

export async function retrieveRelevantChunks(params: {
  workspaceId: string;
  query: string;
  userId?: string | null;
  limit?: number;
}): Promise<RetrievedChunk[]> {
  const embedding = await embedQuery({
    text: params.query,
    userId: params.userId,
    workspaceId: params.workspaceId,
  });

  if (!embedding?.length) return [];

  const vectorLiteral = `[${embedding.join(",")}]`;
  const limit = params.limit ?? 6;

  const rows = await sql`
    SELECT
      c.id,
      c.document_id as "documentId",
      d.title,
      c.page_number as "pageNumber",
      c.content,
      (c.embedding <=> ${sql.unsafe(`'${vectorLiteral}'::vector`)}) as distance
    FROM document_chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE c.workspace_id = ${params.workspaceId}
      AND d.status = 'ready'
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${sql.unsafe(`'${vectorLiteral}'::vector`)}
    LIMIT ${limit}
  `;

  return rows as unknown as RetrievedChunk[];
}
