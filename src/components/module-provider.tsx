"use client"

import * as React from "react"
import {
  DEFAULT_ENABLED,
  MODULES_STORAGE_KEY,
  type ModuleId,
} from "@/lib/modules"

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
  // and hydration output match; stored state is applied after mount.
  const [enabled, setEnabled] = React.useState<Record<ModuleId, boolean>>(DEFAULT_ENABLED)
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(MODULES_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<Record<ModuleId, boolean>>
        setEnabled({ ...DEFAULT_ENABLED, ...parsed })
      }
    } catch {
      // Corrupt stored state falls back to defaults
    }
    setHydrated(true)
  }, [])

  const setModuleEnabled = React.useCallback((id: ModuleId, on: boolean) => {
    setEnabled((prev) => {
      const next = { ...prev, [id]: on }
      try {
        localStorage.setItem(MODULES_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Persistence is best-effort; in-memory state still updates
      }
      return next
    })
  }, [])

  const toggleModule = React.useCallback(
    (id: ModuleId) => {
      setEnabled((prev) => {
        const next = { ...prev, [id]: !prev[id] }
        try {
          localStorage.setItem(MODULES_STORAGE_KEY, JSON.stringify(next))
        } catch {
          // Persistence is best-effort; in-memory state still updates
        }
        return next
      })
    },
    []
  )

  const isEnabled = React.useCallback((id: ModuleId) => enabled[id], [enabled])

  const value = React.useMemo(
    () => ({ enabled, isEnabled, setModuleEnabled, toggleModule, hydrated }),
    [enabled, isEnabled, setModuleEnabled, toggleModule, hydrated]
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
