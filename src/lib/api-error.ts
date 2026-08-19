/**
 * Client-side helper for pulling the message + optional remediation `hint`
 * out of the standard error envelope produced by `src/lib/server/http.ts`.
 *
 * Envelope: `{ error: { code, message, hint?, details? } }`
 *
 * Usage:
 *   const res = await fetch(...)
 *   if (!res.ok) {
 *     const { message, hint } = await parseError(res, "Fallback")
 *     showToast({ message, hint }, "error")
 *   }
 */

export interface ApiErrorInfo {
  message: string;
  hint?: string;
}

/**
 * Given a fetch Response for an error case, returns the caller-friendly
 * message + hint. Never throws — falls back to `fallback` on parse errors.
 */
export async function parseError(res: Response, fallback = "Request failed"): Promise<ApiErrorInfo> {
  const body = await res.json().catch(() => null);
  return extractError(body, fallback);
}

/**
 * Same, but for an already-parsed body. Useful when the call site already
 * needs the body for `data` access on success.
 */
export function extractError(body: unknown, fallback = "Request failed"): ApiErrorInfo {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error?: { message?: unknown; hint?: unknown } }).error;
    const message = typeof err?.message === "string" && err.message ? err.message : fallback;
    const hint = typeof err?.hint === "string" && err.hint ? err.hint : undefined;
    return { message, hint };
  }
  return { message: fallback };
}
