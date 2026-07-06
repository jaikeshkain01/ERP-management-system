"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Lock, Home, Settings } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useModules } from "@/components/module-provider"
import { MODULES, moduleForPath, type ModuleId } from "@/lib/modules"

function ModuleLockedScreen({ moduleId }: { moduleId: ModuleId }) {
  const moduleDef = MODULES.find((m) => m.id === moduleId)

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md border border-border shadow-sm">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-bold text-foreground">
              This module is not included in your plan
            </h2>
            <p className="text-sm text-muted-foreground">
              The <span className="font-semibold text-foreground">{moduleDef?.label ?? moduleId}</span> module
              is currently disabled. Enable it to access this page.
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button className="gap-2 font-semibold" render={<Link href="/settings" />}>
              <Settings className="h-4 w-4" />
              <span>Manage modules</span>
            </Button>
            <Button variant="ghost" className="gap-2" render={<Link href="/" />}>
              <Home className="h-4 w-4" />
              <span>Home</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function ModuleGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { isEnabled } = useModules()

  const moduleId = moduleForPath(pathname)
  if (moduleId && !isEnabled(moduleId)) {
    return <ModuleLockedScreen moduleId={moduleId} />
  }
  return <>{children}</>
}
