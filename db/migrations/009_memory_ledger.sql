-- Phase 9: unified Memory ledger fields + topic links

ALTER TABLE memory_items
  ADD COLUMN IF NOT EXISTS source_kind TEXT DEFAULT 'claim',
  ADD COLUMN IF NOT EXISTS votes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS topic_id TEXT;

CREATE INDEX IF NOT EXISTS memory_items_workspace_deleted_idx
  ON memory_items (workspace_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS memory_items_topic_idx
  ON memory_items (workspace_id, topic_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS memory_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  from_memory_id UUID NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
  to_memory_id UUID REFERENCES memory_items(id) ON DELETE SET NULL,
  link_type TEXT NOT NULL DEFAULT 'related',
  topic TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_links_workspace_idx
  ON memory_links (workspace_id);

CREATE INDEX IF NOT EXISTS memory_links_from_idx
  ON memory_links (from_memory_id);
