"use client"

import * as React from "react"
import { Blocks, LayoutDashboard } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useModules } from "@/components/module-provider"
import { MODULES } from "@/lib/modules"

export function ModulesSettingsCard() {
  const { isEnabled, toggleModule } = useModules()

  return (
    <Card className="border border-border shadow-sm">
      <CardHeader className="border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <Blocks className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-lg font-bold">Modules</CardTitle>
            <CardDescription>
              Enable or disable licensed ERP modules — changes apply instantly
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {/* Base tier — always included */}
          <div className="flex items-center gap-4 px-6 py-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LayoutDashboard className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">Base Platform</p>
              <p className="text-xs text-muted-foreground">
                Dashboard, master data (items, products, PCBs, suppliers, manufacturers) and settings.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              Always included
            </span>
          </div>

          {/* Licensed modules */}
          {MODULES.map((mod) => {
            const Icon = mod.icon
            const on = isEnabled(mod.id)
            return (
              <div key={mod.id} className="flex items-center gap-4 px-6 py-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground">{mod.label}</p>
                  <p className="text-xs text-muted-foreground">{mod.description}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    on
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {on ? "Included" : "Not included"}
                </span>
                <Switch checked={on} onCheckedChange={() => toggleModule(mod.id)} />
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
