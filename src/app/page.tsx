"use client"

import Link from "next/link"
import { LayoutDashboard, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ModuleLauncher } from "@/components/module-launcher"

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Welcome to StackIOT Enterprise Suite
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            Choose a workspace to get started. Locked modules are not part of your current plan.
          </p>
        </div>
        <Button className="gap-2 font-semibold self-start sm:self-auto" render={<Link href="/dashboard" />}>
          <LayoutDashboard className="h-4 w-4" />
          <span>Open Dashboard</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Module launcher */}
      <ModuleLauncher />
    </div>
  )
}
