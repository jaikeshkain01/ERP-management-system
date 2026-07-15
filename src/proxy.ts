/**
 * Edge session gate (Next.js 16 Proxy — the renamed `middleware`, see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
 *
 * DEFENSE IN DEPTH — not the primary line of defense. Every data route is
 * already guarded at the Data Access Layer (`requireSession` + `withTenant`/RLS
 * + `assertPermission`, see src/lib/server/data/*). This proxy adds a single
 * choke point in front of the whole app so an unauthenticated request is turned
 * away before it reaches a handler or a protected page:
 *   - `/api/*`  → JSON 401 (matches the app's error envelope)
 *   - pages     → 307 redirect to `/login`
 *
 * Per Next's auth guidance this stays an OPTIMISTIC check: it only verifies the
 * session cookie (signature + expiry via jose). It performs NO database work and
 * does NOT check tenancy or permissions — those remain at the DAL, close to the
 * data, where cross-tenant scoping (RLS) and RBAC are enforced.
 *
 * Proxy runs on the Node.js runtime in Next 16, so importing the jose-based
 * `verifySession` (and its `node:crypto` sibling) is safe here.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/server/auth";

/**
 * API endpoints reachable WITHOUT a session. `login` establishes one; `logout`
 * must work even with a missing/expired cookie (it is idempotent).
 */
const PUBLIC_API_PATHS = new Set<string>(["/api/auth/login", "/api/auth/logout"]);

/**
 * Pages that render for an unauthenticated visitor. `/login` MUST be here — a
 * signed-out user is redirected here, so gating it would cause a redirect loop.
 * (An already-authenticated user landing on `/login` is bounced to home by the
 * client shell; the server gate stays out of that.)
 */
const PUBLIC_PAGE_PATHS = new Set<string>(["/login"]);

function unauthorizedJson(): NextResponse {
  return NextResponse.json(
    { error: { code: "unauthorized", message: "Not authenticated" } },
    { status: 401 },
  );
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // Public endpoints/pages skip the session check entirely.
  if (isApi ? PUBLIC_API_PATHS.has(pathname) : PUBLIC_PAGE_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // Optimistic auth: signature + expiry of the session cookie only — no DB,
  // no tenancy/permission logic (both enforced at the DAL).
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  if (session) return NextResponse.next();

  // Not authenticated: API callers get a 401 in the standard envelope; page
  // visitors are redirected to the sign-in screen.
  if (isApi) return unauthorizedJson();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  /**
   * Run on every request EXCEPT Next internals and static assets, so CSS/JS,
   * optimized images, and files under `public/` (e.g. the login logo
   * `/images/logo-square.png`, the root `favicon.ico`, and the `*.svg` assets)
   * load without a session. Any path ending in a file extension is treated as a
   * static asset and skipped; `/api/*` and clean page paths still match.
   */
  matcher: ["/((?!_next/static|_next/image|_next/data|favicon.ico|.*\\.[\\w]+$).*)"],
};
