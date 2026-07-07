"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { LayoutGrid, Lock, Settings, ChevronRight } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu"
import { UniversalSearch } from "@/components/universal-search"
import { useModules } from "@/components/module-provider"
import { WORKSPACES, workspaceForPath } from "@/lib/modules"

export function TopBar() {
  const pathname = usePathname()
  const { isEnabled } = useModules()
  const workspace = workspaceForPath(pathname)

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background px-4 md:px-6">
      {/* Logo + name */}
      <Link href="/" className="flex items-center gap-3 shrink-0">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 overflow-hidden">
          <Image
            src="/images/logo-square.png"
            alt="StackIOT"
            width={100}
            height={100}
            className="object-contain p-0.5"
          />
        </div>
        <div className="hidden flex-col sm:flex">
          <span className="text-[13px] font-bold leading-tight tracking-tight text-foreground">
            StackIOT Technologies
          </span>
          <span className="text-[10px] font-medium text-muted-foreground">Enterprise Suite</span>
        </div>
      </Link>

      {/* Module switcher */}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Switch workspace"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[popup-open]:bg-muted data-[popup-open]:text-foreground"
        >
          <LayoutGrid className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={6} className="w-[320px] p-2">
          <p className="px-1.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Workspaces
          </p>
          <div className="grid grid-cols-2 gap-1">
            {WORKSPACES.map((ws) => {
              const Icon = ws.icon
              const locked = ws.moduleId ? !isEnabled(ws.moduleId) : false

              if (locked) {
                return (
                  <div
                    key={ws.id}
                    aria-disabled="true"
                    className="flex items-center gap-2 rounded-md px-2 py-2 opacity-60 cursor-not-allowed select-none"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{ws.label}</span>
                    <Lock className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                  </div>
                )
              }

              return (
                <Link
                  key={ws.id}
                  href={ws.href}
                  className="flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-muted"
                >
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{ws.label}</span>
                </Link>
              )
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Breadcrumb */}
      <div className="hidden items-center gap-1.5 text-sm sm:flex">
        <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
          Home
        </Link>
        {workspace && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            <span className="font-medium text-foreground">{workspace.label}</span>
          </>
        )}
      </div>

      {/* Right cluster */}
      <div className="ml-auto flex items-center gap-2 md:gap-3">
        <div className="hidden sm:flex">
          <UniversalSearch />
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Settings className="h-[18px] w-[18px]" />
        </Link>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
          JW
        </div>
      </div>
    </header>
  )
}
