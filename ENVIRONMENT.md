# Environment

Copy `.env.example` → `.env`. Do not commit secrets.

## Required

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Chat, embeddings, web_search, Realtime |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + SSR anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server storage/admin (never public) |
| `DATABASE_URL` | Postgres URI — prefer **Session pooler** |
| `UPSTASH_REDIS_REST_URL` | Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Redis REST token |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` or production origin |

## Optional model overrides

| Variable | Default intent |
|---|---|
| `FAST_MODEL` | Cheap/default chat |
| `REASONING_MODEL` | Harder interview turns / eval |
| `EMBEDDING_MODEL` | Document/memory embeddings |
| `VOICE_MODEL` | Realtime voice (`gpt-4o-mini-realtime-preview`) |

## Optional integrations

| Variable | When |
|---|---|
| `YOUTUBE_API_KEY` | Video research (graceful skip if absent) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Newer Supabase publishable key alias |

## Notes

- Prefer Upstash REST vars (`UPSTASH_REDIS_REST_*`) over raw `REDIS_URL` for this codebase.
- Rotate any key that was pasted into chat or committed.
