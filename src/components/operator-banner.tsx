"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { LogOut, ShieldAlert } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { useData } from "@/lib/data-provider"
import { useModules } from "@/components/module-provider"

/**
 * Shown only while a superadmin is "inside" a tenant (operator mode): they have
 * opened a company from the console and are looking at its ERP. Makes the context
 * unmistakable, offers an exit back to the console, and a per-session override to
 * unlock modules the tenant hasn't licensed (for reaching areas the customer can't).
 */
export function OperatorBanner() {
  const router = useRouter()
  const { me, reload } = useData()
  const { moduleOverride, setModuleOverride } = useModules()
  const [exiting, setExiting] = React.useState(false)

  // Operator mode = superadmin with an active company (a tenant they opened).
  if (!me?.user?.is_superadmin || !me.company) return null

  const exit = async () => {
    setExiting(true)
    try {
      await fetch("/api/session/company", { method: "DELETE", credentials: "same-origin" })
      await reload()
      router.replace("/superadmin")
    } finally {
      setExiting(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-amber-700 dark:text-amber-300 md:px-6">
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <p className="text-sm font-medium">
        Operator mode — viewing{" "}
        <span className="font-bold">{me.company.name}</span> as superadmin
      </p>

      <label className="ml-auto flex items-center gap-2 text-xs font-medium">
        <Switch checked={moduleOverride} onCheckedChange={setModuleOverride} />
        Unlock all modules
      </label>

      <button
        onClick={exit}
        disabled={exiting}
        className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-amber-500/15 disabled:opacity-60"
      >
        {exiting ? (
          <span>Exiting…</span>
        ) : (
          <>
            <LogOut className="h-3.5 w-3.5" />
            <span>Exit to console</span>
          </>
        )}
      </button>
    </div>
  )
}
