"use client"

import Link from "next/link"
import { Lock, ArrowUpRight } from "lucide-react"
import * as React from "react"
import { useModules } from "@/components/module-provider"
import { WORKSPACES } from "@/lib/modules"
import { buildWorkspaceStats } from "@/mockdata/launchpad"
import { useData } from "@/lib/data-provider"

const toneClass: Record<string, string> = {
  danger: "text-destructive",
  warning: "text-warning",
  default: "text-foreground",
}

export function Launchpad() {
  const { isEnabled } = useModules()
  const d = useData()
  const WORKSPACE_STATS = React.useMemo(() => buildWorkspaceStats(d), [d])

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {WORKSPACES.map((ws) => {
        const Icon = ws.icon
        const locked = ws.moduleId ? !isEnabled(ws.moduleId) : false
        const stat = WORKSPACE_STATS[ws.id]
        const licensed = !!ws.moduleId

        if (locked) {
          return (
            <div
              key={ws.id}
              aria-disabled="true"
              className="relative flex flex-col gap-4 overflow-hidden rounded-lg border border-border border-dashed bg-muted/25 p-5 opacity-80 cursor-not-allowed select-none"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground/70">
                  <Icon className="h-5 w-5" />
                </div>
                <Lock className="h-4 w-4 text-muted-foreground/50" />
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">{ws.label}</p>
                <span className="mt-2 inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <Lock className="h-2.5 w-2.5" />
                  Not in your plan
                </span>
              </div>
            </div>
          )
        }

        return (
          <Link
            key={ws.id}
            href={ws.href}
            className="group relative flex flex-col gap-4 overflow-hidden rounded-md border border-border bg-card p-5 transition-colors hover:border-primary/60 hover:bg-accent/40"
          >
            {/* Left accent rail */}
            <span className="absolute inset-y-0 left-0 w-0.5 bg-primary opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-primary/15 bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                  licensed
                    ? "border-success/25 bg-success/10 text-success"
                    : "border-border bg-muted text-muted-foreground"
                }`}
              >
                {licensed ? "Licensed" : "Base"}
              </span>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{ws.label}</p>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/30 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
              </div>
              {stat && (
                <div className="mt-2.5 flex items-baseline gap-1.5">
                  <span className={`text-2xl font-bold tracking-tight ${toneClass[stat.tone ?? "default"]}`}>
                    {stat.value}
                  </span>
                  <span className="text-xs text-muted-foreground">{stat.label}</span>
                </div>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
