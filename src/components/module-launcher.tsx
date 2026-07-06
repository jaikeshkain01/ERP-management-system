"use client"

import * as React from "react"
import Link from "next/link"
import { Blocks, Lock, ArrowUpRight } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useModules } from "@/components/module-provider"
import { MODULES, BASE_AREAS } from "@/lib/modules"

type LauncherTile = {
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  href: string
  locked: boolean
  base: boolean
}

export function ModuleLauncher() {
  const { isEnabled } = useModules()

  const tiles: LauncherTile[] = [
    ...BASE_AREAS.map((area) => ({ ...area, locked: false, base: true })),
    ...MODULES.map((mod) => ({
      label: mod.label,
      description: mod.description,
      icon: mod.icon,
      href: mod.href,
      locked: !isEnabled(mod.id),
      base: false,
    })),
  ]

  return (
    <Card className="border border-border shadow-sm">
      <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
        <div className="flex items-center gap-2">
          <Blocks className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-lg font-bold">Modules</CardTitle>
            <CardDescription>All workspaces in your ERP — locked modules are not part of your plan</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3">
          {tiles.map((tile) => {
            const Icon = tile.icon

            if (tile.locked) {
              return (
                <div
                  key={tile.label}
                  aria-disabled="true"
                  className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4 opacity-70 cursor-not-allowed select-none"
                >
                  <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate text-muted-foreground">{tile.label}</p>
                    <p className="text-[10px] text-muted-foreground/70 truncate">{tile.description}</p>
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      <Lock className="h-2.5 w-2.5" />
                      Locked
                    </span>
                  </div>
                  <Lock className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                </div>
              )
            }

            return (
              <Link
                key={tile.label}
                href={tile.href}
                className="group flex items-center gap-3 rounded-lg border border-border bg-background p-4 transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm"
              >
                <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate text-foreground">{tile.label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{tile.description}</p>
                  <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    tile.base
                      ? "bg-primary/10 text-primary"
                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  }`}>
                    {tile.base ? "Base" : "Licensed"}
                  </span>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-primary" />
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
