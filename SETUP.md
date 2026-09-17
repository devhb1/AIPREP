# Setup

## 1. Prerequisites

- Node 20+
- Supabase project (Auth email, Storage, Postgres)
- Upstash Redis REST credentials
- OpenAI API key (chat + embeddings; web_search; optional Realtime)

## 2. Environment

```bash
cp .env.example .env
```

Fill values from `ENVIRONMENT.md`.

**Critical:** set `DATABASE_URL` to the **Session pooler** URI (IPv4), not the direct `db.<ref>.supabase.co` host. URL-encode password specials (`@` → `%40`, `$` → `%24`).

## 3. Install + migrate

```bash
npm install
npm run db:migrate
```

If migrate cannot connect, run SQL files `db/migrations/001`–`007` in the Supabase SQL Editor, then ensure Storage bucket `documents` exists (private).

## 4. Auth redirects

Supabase Auth → URL configuration:

```text
http://localhost:3000/auth/callback
```

## 5. Run

```bash
npm run dev
```

Open http://localhost:3000 → sign up → KVS workspace is seeded → upload a small PDF → Mentor chat.

## 6. Smoke

```bash
npm run smoke
```

Then follow the §150 checklist in `DEPLOY.md` (research → approve → plan → practice → mock → optional voice).

## 7. Production

See `DEPLOY.md`.
