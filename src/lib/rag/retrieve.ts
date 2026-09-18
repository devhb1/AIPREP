import { sql } from "@/lib/db";
import { embedQuery } from "@/lib/ai/embeddings";

export const DEFAULT_EXAM_KEY = "kvs_prt_2026";

export type RetrievedChunk = {
  id: string;
  documentId: string | null;
  memoryId?: string | null;
  kbItemId?: string | null;
  title: string;
  pageNumber: number | null;
  content: string;
  distance: number;
  kind: "document" | "memory" | "kb";
};

export function citationSourceLabel(kind: RetrievedChunk["kind"]) {
  if (kind === "kb") return "AIPREP Knowledge Base";
  if (kind === "memory") return "Your Verified Notes";
  return "Your Documents";
}

export async function retrieveRelevantChunks(params: {
  workspaceId: string;
  query: string;
  userId?: string | null;
  limit?: number;
  examKey?: string;
}): Promise<RetrievedChunk[]> {
  const embedding = await embedQuery({
    text: params.query,
    userId: params.userId,
    workspaceId: params.workspaceId,
  });

  if (!embedding?.length) return [];

  const vectorLiteral = `[${embedding.join(",")}]`;
  const limit = params.limit ?? 6;
  const examKey = params.examKey ?? DEFAULT_EXAM_KEY;

  const docRows = (await sql`
    SELECT
      c.id,
      c.document_id as "documentId",
      NULL as "memoryId",
      NULL as "kbItemId",
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
      NULL as "kbItemId",
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

  let kbRows: RetrievedChunk[] = [];
  try {
    kbRows = (await sql`
      SELECT
        e.id,
        NULL as "documentId",
        NULL as "memoryId",
        e.kb_item_id as "kbItemId",
        k.title,
        NULL as "pageNumber",
        k.body as content,
        (e.embedding <=> ${sql.unsafe(`'${vectorLiteral}'::vector`)}) as distance,
        'kb' as kind
      FROM kb_base_embeddings e
      JOIN kb_base_items k ON k.id = e.kb_item_id
      WHERE k.exam_key = ${examKey}
        AND k.admin_verified = true
        AND e.embedding IS NOT NULL
      ORDER BY e.embedding <=> ${sql.unsafe(`'${vectorLiteral}'::vector`)}
      LIMIT ${limit}
    `) as unknown as RetrievedChunk[];
  } catch {
    kbRows = [];
  }

  return [...memoryRows, ...docRows, ...kbRows]
    .sort((a, b) => Number(a.distance) - Number(b.distance))
    .slice(0, limit);
}
