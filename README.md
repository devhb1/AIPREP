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

## Phase 2 features

- Research campaigns (OpenAI web_search, Redis-cached)
- Candidate claim extraction
- Research inbox approve / reject / unconfirmed / note
- Trusted memory + embeddings
- Mentor retrieval prioritizes approved memory over documents
- YouTube gracefully unavailable without `YOUTUBE_API_KEY`

## Phase 3 features

- Syllabus generation from docs + trusted memory (KVS fallback)
- Adaptive study plan + daily tasks
- Today mission view
- Grounded practice MCQs + attempts
- Mistake notebook with remediation tasks
- Next Best Action driven by claims, mistakes, and due tasks

## Phase 4 features

- Text mock interview (Easy / Normal / Strict judges)
- Follow-up questioning + per-answer score/feedback
- End-of-mock report with strengths, weaknesses, improved answers
- Interview-day document checklist
- Answer library + personal stories
- Post-mock drills queued as tasks
- Voice interview deferred to Phase 5

## Phase 5 features

- OpenAI Realtime voice interview (WebRTC + ephemeral server token)
- Live transcript, mute, timer
- Recording/transcript consent gate
- Speech metrics snapshot (fillers, turns, duration)
- End-of-session evaluation reuses Phase 4 report + drills pipeline
- Configure `VOICE_MODEL` (default `gpt-4o-mini-realtime-preview`)

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
