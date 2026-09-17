import { sql } from "@/lib/db";
import { embedQuery } from "@/lib/ai/embeddings";

export type RetrievedChunk = {
  id: string;
  documentId: string | null;
  memoryId?: string | null;
  title: string;
  pageNumber: number | null;
  content: string;
  distance: number;
  kind: "document" | "memory";
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

  const docRows = (await sql`
    SELECT
      c.id,
      c.document_id as "documentId",
      d.title,
      c.page_number as "pageNumber",
      c.content,
      (c.embedding <=> ${sql.unsafe(`'${vectorLiteral}'::vector`)}) as distance,
      'document' as kind
    FROM document_chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE c.workspace_id = ${params.workspaceId}
      AND d.status = 'ready'
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> ${sql.unsafe(`'${vectorLiteral}'::vector`)}
    LIMIT ${limit}
  `) as unknown as RetrievedChunk[];

  const memoryRows = (await sql`
    SELECT
      e.id,
      NULL as "documentId",
      e.memory_id as "memoryId",
      COALESCE(m.title, 'Trusted memory') as title,
      NULL as "pageNumber",
      m.content,
      (e.embedding <=> ${sql.unsafe(`'${vectorLiteral}'::vector`)}) as distance,
      'memory' as kind
    FROM memory_embeddings e
    JOIN memory_items m ON m.id = e.memory_id
    WHERE e.workspace_id = ${params.workspaceId}
      AND m.namespace = 'trusted'
      AND m.status = 'USER_APPROVED'
      AND e.embedding IS NOT NULL
    ORDER BY e.embedding <=> ${sql.unsafe(`'${vectorLiteral}'::vector`)}
    LIMIT ${limit}
  `) as unknown as RetrievedChunk[];

  return [...memoryRows, ...docRows]
    .sort((a, b) => Number(a.distance) - Number(b.distance))
    .slice(0, limit);
}
