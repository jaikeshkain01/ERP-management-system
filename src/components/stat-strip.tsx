import * as React from "react"
import { cn } from "@/lib/utils"

export type StatTone = "default" | "success" | "warning" | "danger"

export type StatItem = {
  label: string
  value: React.ReactNode
  desc?: string
  icon?: React.ComponentType<{ className?: string }>
  /** Accepted for API compatibility; the strip is intentionally monochrome. */
  tone?: StatTone
}

// Literal class strings so Tailwind's scanner can see them (no dynamic interpolation).
const colsByCount: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 md:grid-cols-4",
  5: "grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
  6: "grid-cols-2 md:grid-cols-3 lg:grid-cols-6",
}

/**
 * Joined instrument-panel strip of KPI readouts. Cells share hairline dividers
 * (via `gap-px` over a border-colored track) so they read as one control-panel
 * bar rather than separate floating cards. Used app-wide for stat headers.
 */
export function StatStrip({
  items,
  className,
}: {
  items: StatItem[]
  className?: string
}) {
  const cols = colsByCount[items.length] ?? "grid-cols-2 md:grid-cols-4"
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-md border border-border bg-border",
        cols,
        className
      )}
    >
      {items.map((item, idx) => {
        const Icon = item.icon
        return (
          <div
            key={idx}
            className="group relative flex items-center gap-3.5 bg-card px-5 py-4 transition-colors hover:bg-accent/40"
          >
            {/* Monochrome hover accent rail */}
            <span className="absolute inset-y-0 left-0 w-0.5 bg-foreground/70 opacity-0 transition-opacity group-hover:opacity-100" />
            {Icon && (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-muted text-foreground/70">
                <Icon className="h-5 w-5" />
              </div>
            )}
            <div className="flex min-w-0 flex-col">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {item.label}
              </span>
              <span className="mt-0.5 text-[26px] font-bold leading-none tracking-tight tabular-nums text-foreground">
                {item.value}
              </span>
              {item.desc && (
                <span className="mt-1 truncate text-[11px] leading-tight text-muted-foreground">{item.desc}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
