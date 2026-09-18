/**
 * Wave gate: smoke + budget soak + interview bench.
 * Re-run after each wave before calling the wave done.
 */
import { spawnSync } from "child_process";
import { resolve } from "path";

const tsx = resolve(process.cwd(), "node_modules/.bin/tsx");
const steps = [
  ["smoke", "scripts/smoke.ts"],
  ["budget-soak", "scripts/budget-soak.ts"],
  ["interview-bench", "scripts/interview-bench.ts"],
] as const;

let failed = 0;
for (const [name, file] of steps) {
  console.log(`\n── ${name} ──`);
  const result = spawnSync(tsx, [file], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    failed += 1;
    console.error(`${name} failed with status ${result.status ?? "spawn"}`);
  }
}

process.exit(failed === 0 ? 0 : 1);
