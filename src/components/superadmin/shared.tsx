"use client"

import * as React from "react"
import { X } from "lucide-react"

// ── Types (mirror src/lib/server/data/superadmin.ts, camelCase over the wire) ──
export interface Membership {
  id: string
  companyId: string
  companyName: string
  companyCode: string
  roleId: string | null
  roleName: string | null
  status: string
  isDefault: boolean
}
export interface UserRow {
  id: string
  name: string
  email: string
  isActive: boolean
  isSuperadmin: boolean
  createdAt: string
  memberships: Membership[]
}
export interface CompanyRow {
  id: string
  code: string
  name: string
  createdAt: string
  memberCount: number
  roleCount: number
  modules: Record<string, boolean>
}
export interface RoleRow {
  id: string
  companyId: string
  name: string
  description: string | null
  memberCount: number
  permissions: string[]
}
export interface Overview {
  users: UserRow[]
  companies: CompanyRow[]
  roles: RoleRow[]
  permissionMatrix: Record<string, string[]>
  allPermissions: string[]
  moduleIds: string[]
}

// ── API client (unwraps the { data } / { error } envelope) ─────────────────────
async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error?.message || res.statusText || "Request failed")
  return json.data as T
}
export const sa = {
  get: <T,>(u: string) => req<T>("GET", u),
  post: <T,>(u: string, b?: unknown) => req<T>("POST", u, b),
  patch: <T,>(u: string, b?: unknown) => req<T>("PATCH", u, b),
  put: <T,>(u: string, b?: unknown) => req<T>("PUT", u, b),
  del: <T,>(u: string) => req<T>("DELETE", u),
}

// ── Reusable UI ────────────────────────────────────────────────────────────────

export function Modal({
  title,
  description,
  icon: Icon,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className={`w-full ${wide ? "max-w-2xl" : "max-w-lg"} bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold">{title}</h3>
              {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-5 overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-border px-5 py-4 shrink-0">{footer}</div>
        )}
      </div>
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground/80">{hint}</p>}
    </div>
  )
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs font-medium text-destructive">
      {message}
    </div>
  )
}

/** Native select styled like the repo's inputs. */
export function Select({ className = "", ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={`h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 ${className}`}
      {...props}
    />
  )
}

export function Badge({ tone = "muted", children }: { tone?: "muted" | "success" | "primary" | "danger" | "warning"; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    muted: "bg-muted text-muted-foreground",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    primary: "bg-primary/10 text-primary",
    danger: "bg-destructive/10 text-destructive",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function StatTile({ label, value, tone = "default" }: { label: string; value: React.ReactNode; tone?: "default" | "primary" }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${tone === "primary" ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  )
}
