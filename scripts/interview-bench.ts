/**
 * Golden mock-panel bench: hardcoded opener/closer, max_tokens, then a short
 * live session (2 answers + eval) against the first workspace.
 *
 * Skip the live OpenAI path with SKIP_LIVE_BENCH=1.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { workspaces } from "../src/lib/db/schema";
import {
  INTERVIEW_TURN_MAX_TOKENS,
  answerInterviewTurn,
  endInterviewSession,
  startInterviewSession,
} from "../src/lib/interview/session";
import {
  panelCloser,
  panelOpener,
  personaAfterCandidateTurns,
} from "../src/lib/interview/personas";
import { INTERVIEW_AUDIO_POLICY } from "../src/lib/interview/audio-policy";

type Check = { name: string; ok: boolean; detail?: string };

const GOLDEN = [
  "I want to join KVS as a PRT because I have taught class 1-5 for four years. In a class of 38 I use grouping so slower readers still get a turn with picture cards.",
  "For NEP 2020 I keep a 20-minute play corner for number sense. Children rotate; I observe and note who needs a concrete example the next day.",
];

function add(checks: Check[], name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
}

async function staticChecks(checks: Check[]) {
  const opener = panelOpener("en");
  add(
    checks,
    "opener_hardcoded",
    opener.includes("introduce yourself") && opener.includes("KVS"),
    opener,
  );
  add(
    checks,
    "closer_hardcoded",
    panelCloser("en").toLowerCase().includes("thank you"),
    panelCloser("en"),
  );
  add(
    checks,
    "persona_rotation_hr_pedagogy_ga",
    personaAfterCandidateTurns(0) === "hr" &&
      personaAfterCandidateTurns(3) === "pedagogy" &&
      personaAfterCandidateTurns(8) === "ga",
  );
  add(
    checks,
    "followup_max_tokens",
    INTERVIEW_TURN_MAX_TOKENS === 140,
    String(INTERVIEW_TURN_MAX_TOKENS),
  );
  add(
    checks,
    "audio_not_persisted",
    INTERVIEW_AUDIO_POLICY.persistRawAudio === false,
  );
}

async function liveGolden(checks: Check[]) {
  if (process.env.SKIP_LIVE_BENCH === "1") {
    add(checks, "live_golden_session", true, "skipped (SKIP_LIVE_BENCH=1)");
    return;
  }

  const [ws] = await db
    .select({ id: workspaces.id, userId: workspaces.userId })
    .from(workspaces)
    .limit(1);
  if (!ws) {
    add(checks, "live_golden_session", false, "no workspace in DB");
    return;
  }

  const started = Date.now();
  const { session, openingQuestion } = await startInterviewSession({
    workspaceId: ws.id,
    userId: ws.userId,
    judgeMode: "normal",
    targetMinutes: 5,
    mode: "text",
    language: "en",
  });

  add(
    checks,
    "live_opener_matches",
    openingQuestion === panelOpener("en"),
    openingQuestion.slice(0, 80),
  );

  let lastPersona = "hr";
  for (const answer of GOLDEN) {
    const turnStart = Date.now();
    const result = await answerInterviewTurn({
      sessionId: session.id,
      workspaceId: ws.id,
      userId: ws.userId,
      answer,
    });
    const ms = Date.now() - turnStart;
    lastPersona = result.persona;
    add(
      checks,
      `turn_latency_ms_${result.persona}`,
      ms < 8000,
      `${ms}ms (target <3s on cellular; this is server-side)`,
    );
    add(
      checks,
      `followup_short_${result.persona}`,
      result.interviewerTurn.content.length <= 400,
      `${result.interviewerTurn.content.length} chars`,
    );
  }

  add(
    checks,
    "persona_moved_off_opener",
    lastPersona === "pedagogy" || lastPersona === "hr",
    lastPersona,
  );

  const ended = await endInterviewSession({
    sessionId: session.id,
    workspaceId: ws.id,
    userId: ws.userId,
  });
  const recs = ended.report?.focusRecommendations ?? [];
  add(
    checks,
    "eval_focus_recommendations",
    recs.length >= 1,
    recs[0]?.topic ?? "none",
  );
  add(
    checks,
    "live_session_total_ms",
    true,
    `${Date.now() - started}ms workspace=${ws.id.slice(0, 8)}`,
  );
}

async function main() {
  const checks: Check[] = [];
  await staticChecks(checks);
  try {
    await liveGolden(checks);
  } catch (error) {
    add(
      checks,
      "live_golden_session",
      false,
      error instanceof Error ? error.message : String(error),
    );
  }

  let failed = 0;
  for (const c of checks) {
    if (!c.ok) failed += 1;
    console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  console.log(
    failed === 0
      ? "\nInterview bench OK."
      : `\n${failed} interview-bench check(s) failed.`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
