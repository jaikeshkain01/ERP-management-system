/**
 * POST /api/auth/logout — clears the session cookie. Idempotent.
 */
import { handle, ok } from "@/lib/server/http";
import { clearSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return handle(async () => {
    await clearSessionCookie();
    return ok({ ok: true });
  });
}
