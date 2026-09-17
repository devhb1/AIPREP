# Database

Supabase Postgres + `vector` + `pgcrypto`.

## Apply migrations

```bash
npm run db:migrate
```

Requires Session pooler `DATABASE_URL` (IPv4). Direct `db.<ref>.supabase.co` often fails with `ECONNREFUSED` on IPv6-only hosts.

Fallback: paste `db/migrations/001_*.sql` … `007_*.sql` into Supabase SQL Editor in order.

## Migration map

| File | Contents |
|---|---|
| `001_phase1.sql` | profiles, workspaces, documents, chunks, jobs, chat, ai_usage |
| `002_phase2.sql` | research, sources, claims, memory |
| `003_phase3.sql` | subjects/topics, questions, plans, tasks, mistakes |
| `004_phase4.sql` | interview sessions, turns, checklist, answer library |
| `005_phase5.sql` | voice consent + speech metrics |
| `006_phase6.sql` | notifications |
| `007_rls.sql` | RLS policies + storage policies for `documents` bucket |

## Access patterns

- **Server (Drizzle / service role):** bypasses RLS; always filter by `user_id` / workspace ownership in application code
- **Browser (anon + auth):** RLS enforces own-workspace only via `is_workspace_owner(workspace_id)`

## Important tables

- `document_chunks.embedding vector(1536)` — OpenAI embeddings
- `memory_items.status` — especially `USER_APPROVED`
- `claims.status` — `CANDIDATE` until inbox action
- `ai_usage_events` — spend analytics
- `workspace_settings.max_daily_ai_spend_usd` — default `$1`

## Schema source of truth

Drizzle models: `src/lib/db/schema.ts` (keep in sync with SQL migrations).
