/** Shared helpers for data providers. */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True if `s` looks like a UUID (so we can match a DB PK vs a slug/code). */
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}
