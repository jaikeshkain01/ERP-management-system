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
}

const ModuleContext = React.createContext<ModuleContextValue | null>(null)

export function ModuleProvider({ children }: { children: React.ReactNode }) {
  // SSR and the first client render always see all modules on, so server HTML
  // and hydration output match; the server state is applied after the session
  // is ready (module licensing now persists per-company in the DB, not localStorage).
  const [enabled, setEnabled] = React.useState<Record<ModuleId, boolean>>(DEFAULT_ENABLED)
  const [hydrated, setHydrated] = React.useState(false)
  const { me } = useData()
  // Latest enabled map, for reading current value inside stable callbacks.
  const enabledRef = React.useRef(enabled)
  React.useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  React.useEffect(() => {
    if (!me) return
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
  }, [me])

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

  const isEnabled = React.useCallback((id: ModuleId) => enabled[id], [enabled])

  const value = React.useMemo(
    () => ({ enabled, isEnabled, setModuleEnabled, toggleModule, hydrated }),
    [enabled, isEnabled, setModuleEnabled, toggleModule, hydrated],
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
