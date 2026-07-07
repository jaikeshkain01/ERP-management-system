"use client"

import Link from "next/link"
import { Lock, ArrowUpRight } from "lucide-react"
import { useModules } from "@/components/module-provider"
import { WORKSPACES } from "@/lib/modules"
import { WORKSPACE_STATS } from "@/mockdata/launchpad"

const toneClass: Record<string, string> = {
  danger: "text-destructive",
  warning: "text-amber-600 dark:text-amber-400",
  default: "text-foreground",
}

export function Launchpad() {
  const { isEnabled } = useModules()

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
              className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-5 opacity-70 cursor-not-allowed select-none"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <Lock className="h-4 w-4 text-muted-foreground/60" />
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">{ws.label}</p>
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
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
            className="group flex flex-col gap-3 rounded-xl border border-border bg-background p-5 transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 transition-colors group-hover:text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">{ws.label}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    licensed
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  {licensed ? "Licensed" : "Base"}
                </span>
              </div>
              {stat && (
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className={`text-2xl font-bold ${toneClass[stat.tone ?? "default"]}`}>
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
