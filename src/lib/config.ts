/**
 * Runtime configuration flags.
 *
 * `isTesting` — the data-source toggle (see .env). When true, the backend runs in
 * FULL MOCK MODE: no database connection is made, auth/session is stubbed with an
 * in-memory admin, and all reads come from `src/mockdata`. When false (default),
 * the app uses PostgreSQL with real auth + Row-Level Security.
 *
 * Server-only (no NEXT_PUBLIC_ prefix) — never shipped to the browser.
 */
export const isTesting = process.env.isTesting === "true";
