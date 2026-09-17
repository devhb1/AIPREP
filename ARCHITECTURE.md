# Architecture

AIPREP is a modular Next.js monolith for personal exam/interview preparation. Beta focus: **KVS PRT Interview 2026**.

## Runtime

```text
Browser (App Router UI)
  → Next.js Route Handlers / Server Components
      → Supabase Auth (SSR cookies)
      → Drizzle + postgres.js (DATABASE_URL)
      → Supabase Storage (PDFs)
      → Upstash Redis (AI cache, rate limits, job pointers)
      → OpenAI (chat, embeddings, web_search, Realtime)
```

## Trust model

Evidence → Candidate Claims → User Approval → Trusted Memory.

Mentor retrieval prioritizes `USER_APPROVED` memory, then document chunks. Raw web research never becomes fact without approval.

## Core loops

1. **Documents:** upload PDF → Storage → `jobs` row → extract/chunk/embed → pgvector
2. **Research:** campaign → OpenAI web_search (Redis-cached) → claims inbox → approve → memory embeddings
3. **Prep:** syllabus → study plan/tasks → practice MCQs → mistakes → remediation tasks
4. **Interview:** text or voice mock → turns → evaluation report → answer library + drills
5. **Cost:** daily spend counters + Settings caps gate expensive routes

## Layers

| Path | Role |
|---|---|
| `src/app` | UI + API routes |
| `src/lib/ai` | OpenAI client, models, usage, cache wrappers |
| `src/lib/rag` | Retrieval over docs + memory |
| `src/lib/research` | Campaign runner + claim extraction |
| `src/lib/memory` | Approval → trusted memory |
| `src/lib/planning` | Syllabus, plan, practice, mistakes |
| `src/lib/interview` | Text + voice interview sessions |
| `src/lib/security` | SSRF-safe fetch |
| `src/lib/analytics` | Spend analytics / budget asserts |
| `prompts/` | Versioned agent system prompts |
| `db/migrations` | Ordered SQL (001–007) |

## Jobs

Durable state lives in Postgres `jobs`. Redis may hold queue pointers. Long work runs inline on Vercel routes for beta; Inngest is deferred until timeouts force it.

## Multi-workspace

Schema is multi-workspace; seed auto-creates KVS PRT Interview 2026. Ownership is `workspaces.user_id`.
