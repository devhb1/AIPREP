/**
 * Soak: temporarily zero the daily AI cap, expect assertWithinDailyBudget to
 * throw the founder-facing message, then restore.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { workspaceSettings, workspaces } from "../src/lib/db/schema";
import { assertWithinDailyBudget } from "../src/lib/analytics/usage";
import { DEFAULT_DAILY_AI_USD } from "../src/lib/budget";

async function main() {
  const [ws] = await db
    .select({ id: workspaces.id, userId: workspaces.userId })
    .from(workspaces)
    .limit(1);
  if (!ws) {
    console.error("FAIL  no workspace in DB");
    process.exit(1);
  }

  const [row] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, ws.id))
    .limit(1);
  if (!row) {
    console.error("FAIL  workspace has no settings row");
    process.exit(1);
  }

  const previous = row.maxDailyAiSpendUsd ?? DEFAULT_DAILY_AI_USD;

  await db
    .update(workspaceSettings)
    .set({ maxDailyAiSpendUsd: 0, updatedAt: new Date() })
    .where(eq(workspaceSettings.workspaceId, ws.id));

  let threw = false;
  let message = "";
  try {
    await assertWithinDailyBudget({ workspaceId: ws.id, userId: ws.userId });
  } catch (error) {
    threw = true;
    message = error instanceof Error ? error.message : String(error);
  } finally {
    await db
      .update(workspaceSettings)
      .set({ maxDailyAiSpendUsd: previous, updatedAt: new Date() })
      .where(eq(workspaceSettings.workspaceId, ws.id));
  }

  const ok =
    threw &&
    /Daily AI spend cap reached/i.test(message) &&
    /00:00 UTC/i.test(message);

  console.log(
    `${ok ? "PASS" : "FAIL"}  budget_cap_reached — ${
      threw ? message : "assertWithinDailyBudget did not throw at cap=0"
    }`,
  );
  console.log(
    `${previous === DEFAULT_DAILY_AI_USD || previous === 1 ? "PASS" : "WARN"}  restored_cap — ${previous}`,
  );

  if (!ok) process.exit(1);
  console.log("\nBudget soak OK. Cap restored.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
