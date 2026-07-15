"use client"

import * as React from "react"
import { DEFAULT_ENABLED, type ModuleId } from "@/lib/modules"
import { useData } from "@/lib/data-provider"

type ModuleContextValue = {
  enabled: Record<ModuleId, boolean>
  isEnabled: (id: ModuleId) => boolean
  setModuleEnabled: (id: ModuleId, on: boolean) => void
  toggleModule: (id: ModuleId) => void
  hydrated: boolean
  /**
   * Operator override: when a superadmin has opened a tenant, they see that
   * tenant's real module licensing by default. Flipping this on unlocks every
   * module for their session (view-only preference — it does not change the
   * tenant's stored licensing). Meaningless / always off for normal users.
   */
  moduleOverride: boolean
  setModuleOverride: (on: boolean) => void
}

const ModuleContext = React.createContext<ModuleContextValue | null>(null)

export function ModuleProvider({ children }: { children: React.ReactNode }) {
  // SSR and the first client render always see all modules on, so server HTML
  // and hydration output match; the active company's licensing is applied after
  // the session is ready (persisted per-company in the DB, not localStorage).
  const [enabled, setEnabled] = React.useState<Record<ModuleId, boolean>>(DEFAULT_ENABLED)
  const [hydrated, setHydrated] = React.useState(false)
  const [moduleOverride, setModuleOverride] = React.useState(false)
  const { me } = useData()

  const isSuperadmin = !!me?.user?.is_superadmin
  const companyId = me?.company?.id ?? null
  // Latest enabled map, for reading current value inside stable callbacks.
  const enabledRef = React.useRef(enabled)
  React.useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  // Reset the override whenever the active company changes (open a different tenant
  // and you're back to seeing it exactly as that customer does).
  React.useEffect(() => {
    setModuleOverride(false)
  }, [companyId])

  React.useEffect(() => {
    // No active company (superadmin in the console): no tenant to gate — keep all on.
    if (!me || !companyId) {
      setEnabled(DEFAULT_ENABLED)
      setHydrated(true)
      return
    }
    // Everyone with an active company (normal user OR superadmin who opened a
    // tenant) loads that company's real licensing.
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/modules", { credentials: "same-origin", cache: "no-store" })
        const body = await res.json().catch(() => null)
        if (res.ok && body?.data && !cancelled) {
          setEnabled({ ...DEFAULT_ENABLED, ...body.data })
        }
      } catch {
        // keep defaults on failure
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [me, companyId])

  const persist = React.useCallback((id: ModuleId, on: boolean) => {
    // Optimistic: flip locally, then persist; revert on failure.
    setEnabled((prev) => ({ ...prev, [id]: on }))
    ;(async () => {
      try {
        const res = await fetch("/api/modules", {
          method: "PUT",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, enabled: on }),
        })
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        const body = await res.json().catch(() => null)
        if (body?.data) setEnabled({ ...DEFAULT_ENABLED, ...body.data })
      } catch (err) {
        console.error("[modules] failed to persist toggle:", err)
        setEnabled((prev) => ({ ...prev, [id]: !on })) // revert
      }
    })()
  }, [])

  const setModuleEnabled = React.useCallback((id: ModuleId, on: boolean) => persist(id, on), [persist])
  const toggleModule = React.useCallback(
    (id: ModuleId) => persist(id, !enabledRef.current[id]),
    [persist],
  )

  // Operator override unlocks everything for a superadmin's session; otherwise
  // the active company's licensing decides.
  const overrideActive = isSuperadmin && moduleOverride
  const isEnabled = React.useCallback(
    (id: ModuleId) => overrideActive || enabled[id],
    [overrideActive, enabled],
  )

  const value = React.useMemo(
    () => ({
      enabled,
      isEnabled,
      setModuleEnabled,
      toggleModule,
      hydrated,
      moduleOverride,
      setModuleOverride,
    }),
    [enabled, isEnabled, setModuleEnabled, toggleModule, hydrated, moduleOverride],
  )

  return <ModuleContext.Provider value={value}>{children}</ModuleContext.Provider>
}

export function useModules() {
  const ctx = React.useContext(ModuleContext)
  if (!ctx) {
    throw new Error("useModules must be used within a <ModuleProvider>")
  }
  return ctx
}
