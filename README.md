# AIPREP

Personal AI exam/interview preparation OS. Beta focus: **KVS PRT Interview 2026**.

Evidence → claims → your approval → trusted memory. The mentor answers from approved memory and uploaded docs, not unverified web scrapes.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Supabase (Auth, Postgres + pgvector, Storage)
- Upstash Redis (cache, rate limits)
- OpenAI (chat, embeddings, web_search, Realtime voice)
- Vercel-ready (`DEPLOY.md`)

## What’s built (Phases 1–6 + hardening)

| Area | Capabilities |
|---|---|
| Foundation | Auth, KVS seed workspace, PDF → embed → mentor chat with citations |
| Research | Web research campaigns, claim inbox, approve → trusted memory |
| Prep | Syllabus, adaptive plan, Today tasks, practice MCQs, mistake notebook |
| Interview | Text mocks (Easy/Normal/Strict), checklist, answer library, drills |
| Voice | Realtime WebRTC mock + speech metrics + shared eval pipeline |
| Production | Daily spend caps, usage analytics, JSON/ICS export, SSRF-safe fetch, RLS, docs |

## Quick start

See **[SETUP.md](SETUP.md)** and **[ENVIRONMENT.md](ENVIRONMENT.md)**.

```bash
cp .env.example .env   # fill keys; use Session pooler DATABASE_URL
npm install
npm run db:migrate
npm run dev
npm run smoke
```

## Docs

| Doc | Contents |
|---|---|
| [BUILD.md](BUILD.md) | Locked v2 ship sequence (waves 1–5) |
| [PROMPT-ASK.TXT](PROMPT-ASK.TXT) | Original spec with ✅ / 🟡 / ⬜ status |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System shape + trust model |
| [AGENTS.md](AGENTS.md) | AI call sites + prompts |
| [DATABASE.md](DATABASE.md) | Migrations + schema notes |
| [SECURITY.md](SECURITY.md) | Auth, RLS, secrets, SSRF |
| [SETUP.md](SETUP.md) | Local setup |
| [ENVIRONMENT.md](ENVIRONMENT.md) | Env var reference |
| [DEPLOY.md](DEPLOY.md) | Vercel + §150 smoke checklist |

## Acceptance (§150)

After migrate + deploy/local run, complete the end-to-end loop in `DEPLOY.md`: upload → research → approve → plan → practice → text mock → optional voice → Settings export/spend.

## Notes

- Keep `.env` out of git.
- Prefer small PDFs while validating OpenAI spend.
- Default daily AI cap: **$1** per workspace (Settings).
