# Security

## Auth

- Supabase Auth email/password via `@supabase/ssr`
- Middleware refreshes session cookies
- API routes call `requireUser()` and verify workspace ownership

## Secrets

Never expose to the browser:

- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `DATABASE_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Client may use `NEXT_PUBLIC_SUPABASE_URL` + anon key only.

## RLS

Migration `007_rls.sql` enables row-level security so authenticated clients cannot read other users’ workspaces, documents, claims, memory, or interview data.

Storage objects under `documents` are scoped to `{userId}/...` path prefixes.

## AI / tool safety

- Mentors must cite evidence or admit uncertainty
- Claims stay `CANDIDATE` until explicit approve
- `safeFetch` (`src/lib/security/safe-fetch.ts`) blocks localhost/private IP SSRF targets
- Rate limits via Redis on upload/chat/research/interview routes
- Daily AI spend caps enforced before OpenAI calls

## Voice

Realtime uses short-lived ephemeral client secrets from the server. Recording requires explicit consent flag on the session.

## Deploy

See `DEPLOY.md`. Keep `.env` / `.ENV` out of git.
