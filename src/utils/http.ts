/**
 * Build a `fetch` init for a JSON request body.
 *
 * Defaults to `POST` and sets the JSON `Content-Type` header. Extra init
 * fields (e.g. a different `method` or an `AbortSignal`) can be supplied via
 * `init` and are merged; any headers in `init` override the defaults.
 */
export function jsonRequest(body: unknown, init?: RequestInit): RequestInit {
  return {
    method: 'POST',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    body: JSON.stringify(body),
  }
}
