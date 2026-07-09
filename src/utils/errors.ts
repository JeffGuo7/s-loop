/**
 * Normalize an unknown thrown value into a human-readable message.
 *
 * Returns the `Error.message` when `err` is an `Error`, otherwise falls back to
 * `fallback` (or `String(err)` when no fallback is provided).
 */
export function getErrorMessage(err: unknown, fallback?: string): string {
  if (err instanceof Error) return err.message
  return fallback ?? String(err)
}
