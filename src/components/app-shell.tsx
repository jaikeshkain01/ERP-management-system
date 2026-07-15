"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { TopBar } from "@/components/top-bar"
import { WorkspaceTabs } from "@/components/workspace-tabs"
import { OperatorBanner } from "@/components/operator-banner"
import { ModuleGate } from "@/components/module-gate"
import { DataGate, useData } from "@/lib/data-provider"

/** Routes that render WITHOUT the authenticated app chrome. */
const PUBLIC_ROUTES = new Set(["/login"])

/** Routes a company-less superadmin (console mode) may visit — no tenant needed. */
function consoleAllowed(pathname: string): boolean {
  return pathname.startsWith("/superadmin") || pathname.startsWith("/settings")
}

/**
 * Decides between the public shell (login) and the authenticated shell (top bar,
 * tabs, gated content), and keeps the URL in sync with the session:
 *  - unauthenticated on a protected route → redirect to /login
 *  - authenticated on /login             → redirect to home (console for superadmins)
 *  - console superadmin (no active company) on a tenant route → redirect to /superadmin
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { authState, me } = useData()
  const isPublic = PUBLIC_ROUTES.has(pathname)
  // Superadmin with no active company: they live in the console until they Open a tenant.
  const consoleMode = authState === "authenticated" && !!me?.user?.is_superadmin && !me?.company

  React.useEffect(() => {
    if (authState === "unauthenticated" && !isPublic) router.replace("/login")
    else if (authState === "authenticated" && isPublic) router.replace(consoleMode ? "/superadmin" : "/")
    else if (consoleMode && !isPublic && !consoleAllowed(pathname)) router.replace("/superadmin")
  }, [authState, isPublic, consoleMode, pathname, router])

  // Public pages render on their own (no chrome, no data gate).
  if (isPublic) return <>{children}</>

  // Protected pages: hold a lightweight loader until the session is known. When
  // unauthenticated, the effect above is redirecting to /login.
  if (authState !== "authenticated") return <FullScreenLoader />

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <TopBar />
      <OperatorBanner />
      <WorkspaceTabs />
      <main className="flex-1 overflow-y-auto p-6 md:p-8">
        <DataGate>
          <ModuleGate>{children}</ModuleGate>
        </DataGate>
      </main>
    </div>
  )
}

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm font-medium text-muted-foreground">
      <span className="animate-pulse">Loading…</span>
    </div>
  )
}
