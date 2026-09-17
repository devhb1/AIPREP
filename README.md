# AIPREP — Phase 1

Personal AI exam/interview preparation OS. Beta focus: **KVS PRT Interview 2026**.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Supabase (Auth, Postgres, Storage)
- Upstash Redis (cache, rate limits, job queue)
- OpenAI (chat + embeddings)
- pgvector for document retrieval

## Phase 1 features

- Email/password auth
- Auto-seeded KVS PRT Interview 2026 workspace
- Dashboard with Next Best Action
- PDF upload → extract → chunk → embed → index
- Mentor chat grounded in uploaded documents with citations
- AI usage logging + Redis caching/rate limits

## Setup

1. Copy `.env.example` to `.env` and fill keys.
2. **Critical — DATABASE_URL:** In Supabase → Project Settings → Database → Connection string, copy the **Session pooler** URI (IPv4), not the direct `db.<ref>.supabase.co` host. Direct connections are often IPv6-only and fail on many networks.
   - URL-encode special characters in the password (`@` → `%40`, `$` → `%24`).
3. In Supabase Auth, enable Email provider. Disable “confirm email” for local beta if you want instant signup.
4. Install and migrate:

```bash
npm install
npm run db:migrate
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000), sign up, upload a PDF, then open Mentor chat.

`db:migrate` applies `db/migrations/001_phase1.sql` (tables + `vector` extension) and creates a private Storage bucket named `documents`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local development |
| `npm run build` | Production build |
| `npm run db:migrate` | Apply Phase 1 SQL + ensure `documents` storage bucket |

## Notes

- Trusted memory / web research arrive in Phase 2.
- Keep `.env` out of git.
- Prefer small PDFs while validating OpenAI spend.
