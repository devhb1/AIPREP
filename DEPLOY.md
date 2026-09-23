# Deploy AIPREP to production (Vercel)

## 1. Preconditions

- Supabase project with:
  - Auth email enabled
  - `vector` extension enabled
  - private Storage bucket `documents`
  - **Transaction pooler** `DATABASE_URL` or `TRANSACTION_POOLER_URL` (port **6543**, IPv4).
    Do **not** use Session mode (port 5432) on Vercel — it caps ~15 clients and causes
    `EMAXCONNSESSION` under serverless concurrency. The app rewrites pooler `:5432` → `:6543` when possible.
- Upstash Redis REST URL + token
- OpenAI API key with chat, embeddings, web_search, and (optional) Realtime access
- All migrations applied (`001`–`009`):

```bash
npm run db:migrate
```

If the direct DB host fails (IPv6), use the **Transaction pooler** (port 6543) connection string, or paste the SQL files into the Supabase SQL Editor in order.

**One-shot SQL Editor fallback:** paste `db/manual/ALL_for_sql_editor.sql` into Supabase → SQL Editor → Run. Then create a private Storage bucket named `documents` if it does not exist.

**If pooler says password authentication failed:** Database Settings → reset database password → put the new password (URL-encoded) into the Transaction pooler URI in `.env` / Vercel.

**If you see `EMAXCONNSESSION` / max clients pool_size: 15:** you are on Session mode. Switch Vercel `DATABASE_URL` / `SESSION_POOLER_URL` to Transaction mode (`*.pooler.supabase.com:6543`) or set `TRANSACTION_POOLER_URL`. Redeploy after changing env.

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
TRANSACTION_POOLER_URL
SESSION_POOLER_URL
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
NEXT_PUBLIC_APP_URL=https://YOUR_DOMAIN
FAST_MODEL
REASONING_MODEL
EMBEDDING_MODEL
VOICE_MODEL
CRON_SECRET
JOB_WORKER_SECRET
```

For this deployment set:

```text
NEXT_PUBLIC_APP_URL=https://aiprep-kappa.vercel.app
```

Primary region is `bom1` (Mumbai) via `vercel.json`. Cron hits `/api/jobs/worker` daily at 03:00 UTC on Hobby (upgrade to Pro for frequent drains). You can also hit the worker manually with `CRON_SECRET`.

5. Deploy.

## 3. Supabase Auth redirect URLs

In **Supabase → Authentication → URL Configuration**:

**Site URL** (default after email confirm — must be production):

```text
https://aiprep-kappa.vercel.app
```

**Redirect URLs** (allow list — add all):

```text
https://aiprep-kappa.vercel.app/**
https://aiprep-kappa.vercel.app/auth/callback
http://localhost:3000/**
http://localhost:3000/auth/callback
```

Signup emails use `emailRedirectTo` → `{NEXT_PUBLIC_APP_URL}/auth/callback`. If Site URL stays on `http://localhost:3000`, confirm links will open localhost even for production signups.
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

- Default daily AI cap: `$5` per workspace (beta); separate voice cap default `$3`
- Expensive routes check the cap before calling OpenAI
- Prefer `quick` research depth on low credits
- Keep `VOICE_MODEL` on mini realtime unless needed
- iPhone voice QA matrix: `docs/VOICE_IPHONE_QA.md`

## 6. Security notes

- Never expose `SUPABASE_SERVICE_ROLE_KEY` or `OPENAI_API_KEY` to the browser
- Voice uses ephemeral Realtime tokens only
- `safeFetch` blocks private IPs / localhost for outbound URL fetches
- Keep `.env` out of git
