import * as z from "zod";

/**
 * Convert a Zod schema into a JSON Schema suitable for an LLM tool's
 * `inputSchema` (OpenAI/Anthropic function parameters).
 *
 * The `$schema` field is stripped because providers expect a bare
 * parameters object, not a self-describing JSON Schema document.
 */
export function toInputSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-07" }) as Record<
    string,
    unknown
  >;
  delete json.$schema;
  return json;
}

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Validate raw (untrusted) tool input from the LLM against a Zod schema.
 *
 * On success returns the parsed, typed data. On failure returns a single
 * human-readable error string that can be fed back to the LLM so it can
 * correct the arguments and retry.
 */
export function validateToolInput<T>(
  schema: z.ZodType<T>,
  raw: unknown
): ValidationResult<T> {
  const result = schema.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const issues = result.error.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  return { ok: false, error: `Invalid arguments: ${issues}` };
}
