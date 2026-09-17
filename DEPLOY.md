# Deploy AIPREP to production (Vercel)

## 1. Preconditions

- Supabase project with:
  - Auth email enabled
  - `vector` extension enabled
  - private Storage bucket `documents`
  - **Session pooler** `DATABASE_URL` (IPv4)
- Upstash Redis REST URL + token
- OpenAI API key with chat, embeddings, web_search, and (optional) Realtime access
- All migrations applied:

```bash
npm run db:migrate
```

## 2. Vercel project

1. Push repo to GitHub/GitLab.
2. Import in [vercel.com](https://vercel.com).
3. Framework preset: Next.js.
4. Set Environment Variables (Production + Preview):

```text
OPENAI_API_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
NEXT_PUBLIC_APP_URL=https://YOUR_DOMAIN
FAST_MODEL
REASONING_MODEL
EMBEDDING_MODEL
VOICE_MODEL
```

5. Deploy.

## 3. Supabase Auth redirect URLs

Add:

```text
https://YOUR_DOMAIN/auth/callback
http://localhost:3000/auth/callback
```

## 4. Post-deploy smoke checklist

1. Sign up / sign in
2. Open KVS seed workspace
3. Upload a small PDF → status becomes `ready`
4. Mentor chat returns cited answer
5. Quick research → approve one claim → chat uses trusted memory
6. Generate plan → complete a Today task
7. Text mock interview → report created
8. (Optional) Voice mock with consent
9. Settings shows spend + export JSON/ICS works

## 5. Cost guardrails

- Default daily AI cap: `$1` per workspace (Settings)
- Expensive routes check the cap before calling OpenAI
- Prefer `quick` research depth on low credits
- Keep `VOICE_MODEL` on mini realtime unless needed

## 6. Security notes

- Never expose `SUPABASE_SERVICE_ROLE_KEY` or `OPENAI_API_KEY` to the browser
- Voice uses ephemeral Realtime tokens only
- `safeFetch` blocks private IPs / localhost for outbound URL fetches
- Keep `.env` out of git
