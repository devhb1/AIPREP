-- Phase 8: vector ANN indexes + beta spend defaults

CREATE INDEX IF NOT EXISTS document_chunks_embedding_hnsw_idx
  ON document_chunks
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS memory_embeddings_embedding_hnsw_idx
  ON memory_embeddings
  USING hnsw (embedding vector_cosine_ops);

UPDATE workspace_settings
SET max_daily_ai_spend_usd = GREATEST(COALESCE(max_daily_ai_spend_usd, 0), 5)
WHERE max_daily_ai_spend_usd IS NULL OR max_daily_ai_spend_usd < 5;
