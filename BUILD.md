# BUILD.md — Locked execution plan

`PLAN.md` is the design rationale. **This file is what we ship.** If the two conflict, this file wins.

Audience: coding agents. Beta: 3–5 KVS PRT users, ~$10 OpenAI, iPhone PWA.

---

## Locked decisions (do not relitigate)

| Decision | Why |
|---|---|
| Redesign-in-place, not a rewrite | Schema, jobs, RLS, `src/lib/ai/*` stay |
| No TanStack Query, no d3-force, no Inngest, no new paid APIs | Perceived speed via optimistic UI + SSE; graph later as SVG |
| No agent swarm | One LLM call per interview turn; code decides flow |
| Default mock = turn-based STT → existing text brain → TTS | Realtime stays flag-gated (`NEXT_PUBLIC_ENABLE_REALTIME_VOICE`) |
| 5-nav only: Home / Learn / Memory / Interview / Plan | Founder complaint #2 is product, not a polish pass |
| Caps: **$1.50 AI / $0.50 voice** per workspace/day | Appendix B $0.07 would make one mock impossible |
| Personas in code first | Table later if rotation needs CMS |

Non-goals: YouTube, DOCX, exam-day modes, command palette, multi-exam KB, Realtime as default.

---

## Waves (ship in this order)

### Wave 1 — Feel like an app (IA + tokens + PWA)
- Design tokens (radius/space/motion) used everywhere
- 5-item nav, identical mobile bottom bar + desktop rail, `prefetch`
- **Learn** = mentor + practice + mistakes
- **Home** = NBA + today’s mission (Today page redirects here)
- Documents → Memory PDFs tab; Settings linked from Plan
- iOS standalone meta, install nudge only when not installed
- Seed spend caps $1.50 / $0.50
- Interview hub: one primary CTA → drill; Realtime hidden unless flag

### Wave 2 — Kill lag
- Chat: SSE `started` **before** RAG; first token as soon as model speaks
- NBA Redis cache 90s; invalidate on approve / complete-task / plan gen
- Optimistic complete-task, approve/reject, PDF “processing” row
- Interview warmup ping on hub mount (optional, cheap)

### Wave 3 — USP: one mock panel
- `/interview/mock` (or drill route as the product path)
- 3 personas in code: HR → pedagogy → GA → HR close
- Hardcoded opener + closer (zero LLM)
- `max_tokens` ~40 on follow-ups; prune last 2–3 turns
- Eval adds `focus_recommendations` → NBA + remediation tasks
- Type fallback on same pipeline

### Wave 4 — Knowledge
- Write `memory_links` on approve
- `POST /api/memory/quick-search` (one web_search, cached 24h)
- `kb_base_*` + `scripts/seed-kb.ts` + RAG third source
- Column/SVG graph over links (no d3)

### Wave 5 — Mentor loop
- Chat-styled structured onboarding (chips for days/hours/areas)
- Writes existing `settings.intake`; then `createAdaptivePlan`
- Founder spend strip already in Settings

---

## IA map

```text
Home      /workspace/[id]
Learn     /workspace/[id]/learn              mentor
          /workspace/[id]/learn/practice
          /workspace/[id]/learn/mistakes
Memory    /workspace/[id]/memory
Interview /workspace/[id]/interview          → drill as primary
Plan      /workspace/[id]/plan               settings link at bottom

Redirects: /today → Home, /chat → /learn, /practice → /learn/practice,
           /mistakes → /learn/mistakes, /documents → /memory?tab=documents
```

---

## After each wave

1. `npm run smoke`
2. Manual: Home NBA tap, Learn send one chat, Memory tab, start drill preflight, Plan
3. Do not start the next wave until the previous is usable on a phone-width viewport
