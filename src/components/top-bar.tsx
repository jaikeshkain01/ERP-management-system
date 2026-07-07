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
import { ThemeToggle } from "@/components/theme-toggle"
import { useModules } from "@/components/module-provider"
import { WORKSPACES, workspaceForPath } from "@/lib/modules"

export function TopBar() {
  const pathname = usePathname()
  const { isEnabled } = useModules()
  const workspace = workspaceForPath(pathname)

  return (
    <header className="shell-chrome relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-chrome-border bg-chrome px-4 text-chrome-foreground md:px-6">
      {/* Logo + name */}
      <Link href="/" className="flex items-center gap-2.5 shrink-0">
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/95 shadow-sm overflow-hidden ring-1 ring-white/20">
          <Image
            src="/images/logo-square.png"
            alt="StackIOT"
            width={100}
            height={100}
            className="object-contain p-0.5"
          />
        </div>
        <div className="hidden flex-col leading-none sm:flex">
          <span className="text-[13px] font-semibold tracking-tight text-chrome-strong">
            StackIOT Technologies
          </span>
          <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-chrome-muted">
            Enterprise Suite
          </span>
        </div>
      </Link>

      <div className="mx-1 hidden h-6 w-px bg-chrome-border sm:block" />

      {/* Module switcher */}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Switch workspace"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-chrome-border text-chrome-foreground transition-colors hover:bg-chrome-hover hover:text-chrome-strong data-[popup-open]:bg-chrome-hover data-[popup-open]:text-chrome-strong"
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
        <Link href="/" className="text-chrome-muted hover:text-chrome-strong transition-colors">
          Home
        </Link>
        {workspace && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-chrome-muted/60" />
            <span className="font-medium text-chrome-strong">{workspace.label}</span>
          </>
        )}
      </div>

      {/* Right cluster */}
      <div className="ml-auto flex items-center gap-2 md:gap-3">
        <div className="hidden sm:flex">
          <UniversalSearch />
        </div>
        <ThemeToggle />
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex h-8 w-8 items-center justify-center rounded-md text-chrome-foreground transition-colors hover:bg-chrome-hover hover:text-chrome-strong"
        >
          <Settings className="h-[18px] w-[18px]" />
        </Link>
        <div className="ml-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chrome-accent/25 text-xs font-semibold text-chrome-strong ring-1 ring-chrome-border">
          JW
        </div>
      </div>
    </header>
  )
}
