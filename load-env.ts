/**
 * Loads variables from a .env file (in the current working directory) into
 * process.env. Must be imported before any module that reads process.env.
 *
 * Uses Node's built-in loader (Node 20.12+/21.7+), so no dependency is needed.
 */
try {
  process.loadEnvFile();
} catch {
  // No .env file found — fall back to the real environment variables.
}
