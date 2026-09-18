-- Phase 10: admin-curated base KB + graph RLS for memory_links

CREATE TABLE IF NOT EXISTS kb_base_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_key TEXT NOT NULL DEFAULT 'kvs_prt_2026',
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_url TEXT,
  source_title TEXT,
  published_at DATE,
  admin_verified BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kb_base_items_exam_category_title_uidx
  ON kb_base_items (exam_key, category, title);

CREATE INDEX IF NOT EXISTS kb_base_items_exam_idx
  ON kb_base_items (exam_key);

CREATE TABLE IF NOT EXISTS kb_base_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_item_id UUID NOT NULL REFERENCES kb_base_items(id) ON DELETE CASCADE,
  embedding vector(1536)
);

CREATE INDEX IF NOT EXISTS kb_base_embeddings_item_idx
  ON kb_base_embeddings (kb_item_id);

CREATE INDEX IF NOT EXISTS kb_base_embeddings_hnsw_idx
  ON kb_base_embeddings
  USING hnsw (embedding vector_cosine_ops);

ALTER TABLE kb_base_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kb_base_items_select_all ON kb_base_items;
CREATE POLICY kb_base_items_select_all ON kb_base_items
  FOR SELECT TO authenticated
  USING (true);

ALTER TABLE kb_base_embeddings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kb_base_embeddings_select_all ON kb_base_embeddings;
CREATE POLICY kb_base_embeddings_select_all ON kb_base_embeddings
  FOR SELECT TO authenticated
  USING (true);

ALTER TABLE memory_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memory_links_all_own ON memory_links;
CREATE POLICY memory_links_all_own ON memory_links
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));
