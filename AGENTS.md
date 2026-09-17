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
