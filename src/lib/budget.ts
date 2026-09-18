/**
 * Appendix B retune after measuring turn-based mock cost (STT + capped
 * follow-up + TTS + one eval). Theoretical per-workspace formula
 * `10 / (4 users × 14 days) × 0.7 ≈ $0.125` cannot fund one mock.
 *
 * Hardcoded envelope (10-turn panel, FAST_MODEL, tts-1, mini-transcribe):
 *   ~$0.12 AI+voice per mock. Daily cap funds 1 mock + mentor + 1 quick-search.
 * Total $10 still depends on users not maxing the cap every day.
 */
export const BETA_TOTAL_USD = 10;
export const BETA_USERS = 4;
export const BETA_DAYS = 14;
export const BETA_SAFETY = 0.7;

export const MOCK_SESSION_COST_USD = 0.12;

const formulaRaw =
  (BETA_TOTAL_USD / (BETA_USERS * BETA_DAYS)) * BETA_SAFETY;

export const DEFAULT_DAILY_AI_USD = 1;
export const DEFAULT_DAILY_VOICE_USD = 0.4;

/** Per-account token allotment for allowlisted beta testers (skip daily $ caps). */
export const BETA_ACCOUNT_TOKEN_CAP = 10_000_000;

const DEFAULT_BETA_UNLIMITED_EMAILS = ["yisebo4819@dreameg.com"];

export function betaUnlimitedEmails() {
  const extra = (process.env.BETA_UNLIMITED_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_BETA_UNLIMITED_EMAILS, ...extra]);
}

export function isBetaUnlimitedEmail(email?: string | null) {
  if (!email) return false;
  return betaUnlimitedEmails().has(email.trim().toLowerCase());
}

export const APPENDIX_B_FORMULA_USD = Number(formulaRaw.toFixed(3));
