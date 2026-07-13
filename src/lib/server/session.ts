/**
 * Session <-> request glue. Reads the httpOnly session cookie, verifies the JWT,
 * and yields the {userId, companyId} context that `withTenant` needs. Also
 * sets/clears the cookie on login, logout, and company switch.
 */
import { cookies } from "next/headers";
import type { TenantContext } from "@/lib/prisma";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
  verifySession,
} from "@/lib/server/auth";
import { Errors } from "@/lib/server/http";

/** Return the session context, or null if unauthenticated. */
export async function getSession(): Promise<TenantContext | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySession(token);
  return claims ? { userId: claims.userId, companyId: claims.companyId } : null;
}

/** Return the session context or throw 401. Use at the top of protected routes. */
export async function requireSession(): Promise<TenantContext> {
  const session = await getSession();
  if (!session) throw Errors.unauthorized();
  return session;
}

/** Issue (or refresh) the session cookie for a user + active company. */
export async function setSessionCookie(ctx: TenantContext): Promise<void> {
  const token = await signSession(ctx);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions());
}

/** Remove the session cookie (logout). */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
