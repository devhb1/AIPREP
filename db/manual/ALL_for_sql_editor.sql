-- Phase 1 schema for AIPREP (Supabase Postgres + pgvector)

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  preparation_type TEXT NOT NULL,
  organization TEXT,
  role TEXT,
  exam_date TIMESTAMPTZ,
  interview_date TIMESTAMPTZ,
  current_stage TEXT,
  location TEXT,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  preferred_language TEXT DEFAULT 'English',
  daily_study_hours REAL,
  preparation_level TEXT,
  is_seed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspaces_user_id_idx ON workspaces(user_id);

CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  max_daily_ai_spend_usd REAL DEFAULT 1,
  max_research_queries INTEGER DEFAULT 20,
  settings JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  byte_size INTEGER,
  status TEXT NOT NULL DEFAULT 'uploaded',
  page_count INTEGER,
  category TEXT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_workspace_id_idx ON documents(workspace_id);
CREATE INDEX IF NOT EXISTS documents_status_idx ON documents(status);

CREATE TABLE IF NOT EXISTS document_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, page_number)
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  page_number INTEGER,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_estimate INTEGER,
  embedding vector(1536),
  content_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_chunks_workspace_id_idx ON document_chunks(workspace_id);
CREATE INDEX IF NOT EXISTS document_chunks_document_id_idx ON document_chunks(document_id);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  payload JSONB DEFAULT '{}'::jsonb,
  result JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status);
CREATE INDEX IF NOT EXISTS jobs_type_idx ON jobs(type);

CREATE TABLE IF NOT EXISTS chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'Mentor chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  citations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  feature TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  estimated_cost_usd REAL DEFAULT 0,
  cached BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_user_created_idx ON ai_usage_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS ai_usage_workspace_created_idx ON ai_usage_events(workspace_id, created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Storage bucket note: create private bucket named "documents" in Supabase Storage UI.
-- Phase 2: Research campaigns, claims inbox, trusted memory

CREATE TABLE IF NOT EXISTS research_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  depth TEXT NOT NULL DEFAULT 'standard',
  status TEXT NOT NULL DEFAULT 'queued',
  summary TEXT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS research_campaigns_workspace_idx ON research_campaigns(workspace_id);
CREATE INDEX IF NOT EXISTS research_campaigns_status_idx ON research_campaigns(status);

CREATE TABLE IF NOT EXISTS research_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES research_campaigns(id) ON DELETE CASCADE,
  cluster TEXT NOT NULL,
  query TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES research_campaigns(id) ON DELETE SET NULL,
  url TEXT,
  title TEXT,
  publisher TEXT,
  source_type TEXT DEFAULT 'web',
  snippet TEXT,
  raw_content TEXT,
  quality_score REAL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sources_workspace_idx ON sources(workspace_id);

CREATE TABLE IF NOT EXISTS research_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES research_campaigns(id) ON DELETE CASCADE,
  query_id UUID REFERENCES research_queries(id) ON DELETE SET NULL,
  source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES research_campaigns(id) ON DELETE SET NULL,
  statement TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CANDIDATE',
  confidence REAL DEFAULT 0.5,
  assessment TEXT,
  topic TEXT,
  conflict_note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claims_workspace_status_idx ON claims(workspace_id, status);

CREATE TABLE IF NOT EXISTS claim_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  support_level TEXT DEFAULT 'mentioned',
  excerpt TEXT,
  UNIQUE(claim_id, source_id)
);

CREATE TABLE IF NOT EXISTS claim_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  claim_id_a UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  claim_id_b UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  claim_id UUID REFERENCES claims(id) ON DELETE SET NULL,
  namespace TEXT NOT NULL DEFAULT 'trusted',
  title TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'USER_APPROVED',
  version INTEGER NOT NULL DEFAULT 1,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_items_workspace_namespace_idx ON memory_items(workspace_id, namespace);

CREATE TABLE IF NOT EXISTS memory_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memory_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  content_hash TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_embeddings_workspace_idx ON memory_embeddings(workspace_id);
-- Phase 3: Syllabus, questions, study plans, tasks, skills, mistakes

CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  weight REAL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subjects_workspace_idx ON subjects(workspace_id);

CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  importance REAL DEFAULT 0.5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS topics_workspace_idx ON topics(workspace_id);

CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'mcq',
  difficulty TEXT DEFAULT 'medium',
  explanation TEXT,
  source_kind TEXT DEFAULT 'generated',
  grounding_note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS questions_workspace_idx ON questions(workspace_id);

CREATE TABLE IF NOT EXISTS question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  content TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS question_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_option_id UUID,
  answer_text TEXT,
  is_correct BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS question_attempts_workspace_idx ON question_attempts(workspace_id);

CREATE TABLE IF NOT EXISTS study_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  summary TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES study_plans(id) ON DELETE SET NULL,
  topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT DEFAULT 'study',
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  estimated_minutes INTEGER DEFAULT 25,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_workspace_status_idx ON tasks(workspace_id, status);
CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON tasks(due_date);

CREATE TABLE IF NOT EXISTS user_skill_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  mastery REAL NOT NULL DEFAULT 0.2,
  attempts INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  last_practiced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_skill_states_workspace_idx ON user_skill_states(workspace_id);

CREATE TABLE IF NOT EXISTS mistake_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
  topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
  note TEXT,
  remediation_task_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mistake_events_workspace_idx ON mistake_events(workspace_id);
-- Phase 4: Interview mocks, checklist, answer library, stories

CREATE TABLE IF NOT EXISTS panel_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  public_bio TEXT,
  focus_areas JSONB DEFAULT '[]'::jsonb,
  source_urls JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interview_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  items JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'text',
  judge_mode TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'active',
  target_minutes INTEGER DEFAULT 20,
  summary TEXT,
  overall_score REAL,
  report JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS interview_sessions_workspace_idx ON interview_sessions(workspace_id);

CREATE TABLE IF NOT EXISTS interview_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  turn_index INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  score REAL,
  feedback TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS interview_turns_session_idx ON interview_turns(session_id);

CREATE TABLE IF NOT EXISTS interview_answers_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  answer TEXT NOT NULL,
  improved_answer TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  source_session_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS interview_answers_library_workspace_idx ON interview_answers_library(workspace_id);

CREATE TABLE IF NOT EXISTS personal_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Phase 5: voice interview speech metrics + recording preferences

ALTER TABLE interview_sessions
  ADD COLUMN IF NOT EXISTS recording_consent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS speech_metrics JSONB DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS speech_metrics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL,
  value REAL,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS speech_metrics_events_session_idx ON speech_metrics_events(session_id);
-- Phase 6: notifications + settings helpers

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  kind TEXT NOT NULL DEFAULT 'info',
  href TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications(user_id, created_at DESC);
-- Phase 7: Row Level Security — own-workspace isolation for anon/authenticated roles.
-- Server-side Drizzle via DATABASE_URL / service_role bypasses RLS by design.

CREATE OR REPLACE FUNCTION public.is_workspace_owner(ws_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspaces w
    WHERE w.id = ws_id
      AND w.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_workspace_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_owner(uuid) TO authenticated, anon, service_role;

-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_select_own ON profiles;
CREATE POLICY profiles_select_own ON profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS profiles_insert_own ON profiles;
CREATE POLICY profiles_insert_own ON profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- workspaces
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspaces_all_own ON workspaces;
CREATE POLICY workspaces_all_own ON workspaces
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- workspace_settings
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_settings_all_own ON workspace_settings;
CREATE POLICY workspace_settings_all_own ON workspace_settings
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

-- documents (+ pages/chunks)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documents_all_own ON documents;
CREATE POLICY documents_all_own ON documents
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

ALTER TABLE document_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_pages_all_own ON document_pages;
CREATE POLICY document_pages_all_own ON document_pages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_pages.document_id
        AND public.is_workspace_owner(d.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_pages.document_id
        AND public.is_workspace_owner(d.workspace_id)
    )
  );

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_chunks_all_own ON document_chunks;
CREATE POLICY document_chunks_all_own ON document_chunks
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

-- jobs / chat / usage / audit
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jobs_all_own ON jobs;
CREATE POLICY jobs_all_own ON jobs
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_workspace_owner(workspace_id))
  WITH CHECK (user_id = auth.uid() OR public.is_workspace_owner(workspace_id));

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_threads_all_own ON chat_threads;
CREATE POLICY chat_threads_all_own ON chat_threads
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_messages_all_own ON chat_messages;
CREATE POLICY chat_messages_all_own ON chat_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chat_threads t
      WHERE t.id = chat_messages.thread_id
        AND public.is_workspace_owner(t.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_threads t
      WHERE t.id = chat_messages.thread_id
        AND public.is_workspace_owner(t.workspace_id)
    )
  );

ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_usage_select_own ON ai_usage_events;
CREATE POLICY ai_usage_select_own ON ai_usage_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_workspace_owner(workspace_id));

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_select_own ON audit_logs;
CREATE POLICY audit_logs_select_own ON audit_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_workspace_owner(workspace_id));

-- research / claims / memory
ALTER TABLE research_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS research_campaigns_all_own ON research_campaigns;
CREATE POLICY research_campaigns_all_own ON research_campaigns
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

ALTER TABLE research_queries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS research_queries_all_own ON research_queries;
CREATE POLICY research_queries_all_own ON research_queries
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM research_campaigns c
      WHERE c.id = research_queries.campaign_id
        AND public.is_workspace_owner(c.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM research_campaigns c
      WHERE c.id = research_queries.campaign_id
        AND public.is_workspace_owner(c.workspace_id)
    )
  );

ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sources_all_own ON sources;
CREATE POLICY sources_all_own ON sources
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

ALTER TABLE research_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS research_results_all_own ON research_results;
CREATE POLICY research_results_all_own ON research_results
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM research_campaigns c
      WHERE c.id = research_results.campaign_id
        AND public.is_workspace_owner(c.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM research_campaigns c
      WHERE c.id = research_results.campaign_id
        AND public.is_workspace_owner(c.workspace_id)
    )
  );

ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS claims_all_own ON claims;
CREATE POLICY claims_all_own ON claims
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

ALTER TABLE claim_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS claim_sources_all_own ON claim_sources;
CREATE POLICY claim_sources_all_own ON claim_sources
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM claims c
      WHERE c.id = claim_sources.claim_id
        AND public.is_workspace_owner(c.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM claims c
      WHERE c.id = claim_sources.claim_id
        AND public.is_workspace_owner(c.workspace_id)
    )
  );

ALTER TABLE claim_conflicts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS claim_conflicts_all_own ON claim_conflicts;
CREATE POLICY claim_conflicts_all_own ON claim_conflicts
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

ALTER TABLE memory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memory_items_all_own ON memory_items;
CREATE POLICY memory_items_all_own ON memory_items
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

ALTER TABLE memory_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memory_versions_all_own ON memory_versions;
CREATE POLICY memory_versions_all_own ON memory_versions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memory_items m
      WHERE m.id = memory_versions.memory_id
        AND public.is_workspace_owner(m.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memory_items m
      WHERE m.id = memory_versions.memory_id
        AND public.is_workspace_owner(m.workspace_id)
    )
  );

ALTER TABLE memory_embeddings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memory_embeddings_all_own ON memory_embeddings;
CREATE POLICY memory_embeddings_all_own ON memory_embeddings
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

-- prep intelligence
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subjects_all_own ON subjects;
CREATE POLICY subjects_all_own ON subjects
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS topics_all_own ON topics;
CREATE POLICY topics_all_own ON topics
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS questions_all_own ON questions;
CREATE POLICY questions_all_own ON questions
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

ALTER TABLE question_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS question_options_all_own ON question_options;
CREATE POLICY question_options_all_own ON question_options
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM questions q
      WHERE q.id = question_options.question_id
        AND public.is_workspace_owner(q.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM questions q
      WHERE q.id = question_options.question_id
        AND public.is_workspace_owner(q.workspace_id)
    )
  );

ALTER TABLE question_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS question_attempts_all_own ON question_attempts;
CREATE POLICY question_attempts_all_own ON question_attempts
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_workspace_owner(workspace_id))
  WITH CHECK (user_id = auth.uid() OR public.is_workspace_owner(workspace_id));

ALTER TABLE study_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS study_plans_all_own ON study_plans;
CREATE POLICY study_plans_all_own ON study_plans
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tasks_all_own ON tasks;
CREATE POLICY tasks_all_own ON tasks
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

ALTER TABLE user_skill_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_skill_states_all_own ON user_skill_states;
CREATE POLICY user_skill_states_all_own ON user_skill_states
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_workspace_owner(workspace_id))
  WITH CHECK (user_id = auth.uid() OR public.is_workspace_owner(workspace_id));

ALTER TABLE mistake_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mistake_events_all_own ON mistake_events;
CREATE POLICY mistake_events_all_own ON mistake_events
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_workspace_owner(workspace_id))
  WITH CHECK (user_id = auth.uid() OR public.is_workspace_owner(workspace_id));

-- interview
ALTER TABLE panel_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS panel_profiles_all_own ON panel_profiles;
CREATE POLICY panel_profiles_all_own ON panel_profiles
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

ALTER TABLE interview_checklists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS interview_checklists_all_own ON interview_checklists;
CREATE POLICY interview_checklists_all_own ON interview_checklists
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS interview_sessions_all_own ON interview_sessions;
CREATE POLICY interview_sessions_all_own ON interview_sessions
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

ALTER TABLE speech_metrics_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS speech_metrics_all_own ON speech_metrics_events;
CREATE POLICY speech_metrics_all_own ON speech_metrics_events
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

ALTER TABLE interview_turns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS interview_turns_all_own ON interview_turns;
CREATE POLICY interview_turns_all_own ON interview_turns
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM interview_sessions s
      WHERE s.id = interview_turns.session_id
        AND public.is_workspace_owner(s.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM interview_sessions s
      WHERE s.id = interview_turns.session_id
        AND public.is_workspace_owner(s.workspace_id)
    )
  );

ALTER TABLE interview_answers_library ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS interview_answers_all_own ON interview_answers_library;
CREATE POLICY interview_answers_all_own ON interview_answers_library
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

ALTER TABLE personal_stories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS personal_stories_all_own ON personal_stories;
CREATE POLICY personal_stories_all_own ON personal_stories
  FOR ALL TO authenticated
  USING (public.is_workspace_owner(workspace_id))
  WITH CHECK (public.is_workspace_owner(workspace_id));

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_all_own ON notifications;
CREATE POLICY notifications_all_own ON notifications
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Storage: private documents bucket — path prefix = auth.uid()
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', false, 15728640, ARRAY['application/pdf']::text[])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS documents_storage_select_own ON storage.objects;
CREATE POLICY documents_storage_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS documents_storage_insert_own ON storage.objects;
CREATE POLICY documents_storage_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS documents_storage_update_own ON storage.objects;
CREATE POLICY documents_storage_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS documents_storage_delete_own ON storage.objects;
CREATE POLICY documents_storage_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);
