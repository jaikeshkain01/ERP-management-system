/**
 * Session <-> request glue. Reads the httpOnly session cookie, verifies the JWT,
 * and yields the {userId, companyId} context that `withTenant` needs. Also
 * sets/clears the cookie on login, logout, and company switch.
 */
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  type SessionClaims,
  sessionCookieOptions,
  signSession,
  verifySession,
} from "@/lib/server/auth";
import { Errors } from "@/lib/server/http";

/**
 * A resolved session. `companyId` is null for a superadmin in the console
 * (no active tenant). Tenant-scoped work must go through `withTenant`, which
 * throws when there is no active company — so a null here is always handled
 * before any RLS query runs.
 */
export type Session = SessionClaims;

/** Return the session, or null if unauthenticated. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Return the session or throw 401. Company may be null (console superadmin). */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw Errors.unauthorized();
  return session;
}

/** Issue (or refresh) the session cookie for a user + active company (null = console). */
export async function setSessionCookie(ctx: Session): Promise<void> {
  const token = await signSession(ctx);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions());
}

/** Remove the session cookie (logout). */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
