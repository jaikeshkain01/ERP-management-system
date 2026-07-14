"use client"

import * as React from "react"
import { Users, Building2, Shield, Blocks, ShieldAlert, RefreshCw } from "lucide-react"
import { useData } from "@/lib/data-provider"
import { sa, type Overview } from "@/components/superadmin/shared"
import { UsersPanel } from "@/components/superadmin/users-panel"
import { CompaniesPanel } from "@/components/superadmin/companies-panel"
import { RolesPanel } from "@/components/superadmin/roles-panel"
import { ModulesPanel } from "@/components/superadmin/modules-panel"

type TabId = "users" | "companies" | "roles" | "modules"
const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "users", label: "Users", icon: Users },
  { id: "companies", label: "Companies", icon: Building2 },
  { id: "roles", label: "Roles & Permissions", icon: Shield },
  { id: "modules", label: "Module Licensing", icon: Blocks },
]

export function SuperadminConsole() {
  const { me } = useData()
  const [tab, setTab] = React.useState<TabId>("users")
  const [data, setData] = React.useState<Overview | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const reload = React.useCallback(async () => {
    // Await first — no synchronous setState in the effect that calls this.
    try {
      const overview = await sa.get<Overview>("/api/superadmin/overview")
      setData(overview)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void reload() }, [reload])

  // Client-side gate (the API enforces this server-side too).
  if (me && me.user.is_superadmin === false) return <AccessDenied />

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Superadmin</span><span>/</span>
          <span className="font-medium text-foreground">Platform Administration</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Superadmin Console</h1>
            <p className="text-muted-foreground">Manage users, tenant companies, roles &amp; permissions, and module licensing across the platform.</p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          )
        })}
        <button
          onClick={() => reload()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {loading && <LoadingState />}
      {error && !loading && <ErrorState message={error} onRetry={reload} />}
      {data && !error && (
        <>
          {tab === "users" && <UsersPanel data={data} reload={reload} />}
          {tab === "companies" && <CompaniesPanel data={data} reload={reload} />}
          {tab === "roles" && <RolesPanel data={data} reload={reload} />}
          {tab === "modules" && <ModulesPanel data={data} reload={reload} />}
        </>
      )}
    </div>
  )
}

function LoadingState() {
  return <div className="flex h-48 items-center justify-center text-sm font-medium text-muted-foreground"><span className="animate-pulse">Loading console…</span></div>
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm font-semibold text-destructive">Could not load the console</p>
      <p className="max-w-md text-xs text-muted-foreground">{message}</p>
      <button onClick={onRetry} className="rounded-lg border border-border bg-card px-4 py-1.5 text-xs font-semibold hover:bg-muted/50">Retry</button>
    </div>
  )
}

function AccessDenied() {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
        <ShieldAlert className="h-7 w-7" />
      </div>
      <h1 className="text-xl font-bold">Superadmin access required</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This console is restricted to platform superadministrators. Your account does not have that privilege.
      </p>
    </div>
  )
}
