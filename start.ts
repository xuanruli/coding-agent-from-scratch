/**
 * Runnable entry point. Bootstraps the assembled agent defined in cli.ts.
 *
 * Run with: pnpm start  (compiles, then runs; .env is loaded by Node via the
 * --env-file-if-exists flag configured in the start script).
 */
import { main } from "./cli.js";

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
