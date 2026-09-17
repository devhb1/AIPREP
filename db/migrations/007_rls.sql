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
