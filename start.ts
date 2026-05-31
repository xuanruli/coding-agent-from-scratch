/**
 * Runnable entry point. Bootstraps the assembled agent defined in cli.ts.
 *
 * Run with: npm start  (after npm run build)
 */
import "./load-env.js";
import { main } from "./cli.js";

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
