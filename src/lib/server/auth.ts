/**
 * Auth primitives: password hashing (Node scrypt — no native deps) and JWT
 * session tokens (jose, HS256). The session cookie is httpOnly; the token
 * carries the user id and the ACTIVE company id, which become the RLS context.
 */
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { SignJWT, jwtVerify } from "jose";

const scrypt = promisify(_scrypt);
const KEYLEN = 64;

/** Hash a plaintext password → `scrypt:<saltHex>:<hashHex>` (self-describing). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, KEYLEN)) as Buffer;
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}

/** Constant-time verify of a plaintext password against a stored hash. */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scrypt(password, salt, expected.length)) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// ── JWT session tokens ───────────────────────────────────────────────────────

export const SESSION_COOKIE = "erp_session";
const SESSION_TTL = "7d";
const ALG = "HS256";

export interface SessionClaims {
  /** user id (JWT `sub`) */
  userId: string;
  /**
   * Active company id (JWT `company`). Null for a superadmin sitting in the
   * cross-tenant console: superadmins belong to no company and only acquire a
   * company context when they explicitly "Open" a tenant (operator mode).
   */
  companyId: string | null;
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set (see .env).");
  return new TextEncoder().encode(s);
}

/** Sign a session token embedding the user + active company (company omitted when null). */
export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT(claims.companyId ? { company: claims.companyId } : {})
    .setProtectedHeader({ alg: ALG })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secret());
}

/** Verify + decode a session token. Returns null if invalid/expired. */
export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: [ALG] });
    if (typeof payload.sub !== "string") return null;
    // A missing/blank company claim = no active company (console superadmin).
    const companyId = typeof payload.company === "string" && payload.company ? payload.company : null;
    return { userId: payload.sub, companyId };
  } catch {
    return null;
  }
}

/** Cookie options for the session cookie (secure only in production). */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7, // 7d, matches SESSION_TTL
  };
}
