# Agents

Structured AI call sites (not autonomous multi-agent swarm). All go through `src/lib/ai/*` with Redis cache + usage logging when applicable.

| Agent / feature | Entry | Prompt |
|---|---|---|
| Mentor chat | `POST /api/chat` | `mentorSystem` |
| Research campaign | `src/lib/research/campaign.ts` | OpenAI `web_search` + `claimExtractionSystem` |
| Memory approval | `src/lib/memory/approval.ts` | deterministic promotion (no free-form invent) |
| Syllabus | `src/lib/planning/syllabus.ts` | `syllabusSystem` |
| Practice MCQ | `src/lib/planning/practice.ts` | `practiceMcqSystem` |
| Planner / NBA | `src/lib/planning/planner.ts` | mostly deterministic + light AI |
| Interview checklist | `src/lib/interview/session.ts` | `interviewChecklistSystem` |
| Text mock | `src/lib/interview/session.ts` | `textInterviewSystem`, `interviewFollowupSystem`, `interviewEvalSystem` |
| Voice mock | `src/lib/interview/voice.ts` | `voiceInterviewSystem` + Realtime ephemeral token |

## Conventions

- Zod-validate model JSON before DB writes
- Feature string on every `logAiUsage` call
- Budget gate (`assertWithinDailyBudget`) on chat/research/practice/interview/voice
- Prompt templates live in `prompts/index.ts` (`PROMPT_VERSION`)

## Intentionally not agents

- Auth, storage upload, exports, settings — plain services
- Claim approve/reject — user-gated state machine

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
