"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useModules } from "@/components/module-provider"
import { workspaceForPath, activeTabHref } from "@/lib/modules"

export function WorkspaceTabs() {
  const pathname = usePathname()
  const { isEnabled } = useModules()
  const workspace = workspaceForPath(pathname)

  if (!workspace || workspace.tabs.length === 0) return null

  // Whole workspace is locked → the gate shows the lock screen, so hide the tab bar too.
  if (workspace.moduleId && !isEnabled(workspace.moduleId)) return null

  const tabs = workspace.tabs.filter((t) => (t.moduleId ? isEnabled(t.moduleId) : true))
  if (tabs.length === 0) return null

  const activeHref = activeTabHref(workspace, pathname)
  const Icon = workspace.icon

  return (
    <div className="sticky top-14 z-20 flex h-11 shrink-0 items-center gap-4 border-b border-border bg-card px-4 shadow-[0_1px_2px_-1px_rgba(15,36,54,0.08)] md:px-6">
      <div className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-foreground">
        <Icon className="h-4 w-4 text-primary" />
        <span className="hidden sm:inline">{workspace.label}</span>
      </div>
      <div className="h-4 w-px bg-border" />
      <nav className="flex items-center gap-0.5 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.href === activeHref
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] transition-colors ${
                active
                  ? "border-primary font-semibold text-primary"
                  : "border-transparent font-medium text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.title}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
