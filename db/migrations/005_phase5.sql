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
