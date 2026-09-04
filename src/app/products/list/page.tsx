"use client"

/**
 * Assembled Products workspace list.
 *
 * Post-consolidation this page reads the universal items master and filters
 * to `itemType === 'assembled' OR isFinishedGood === true` — the union of
 * "assembled products" (structural stage) and "sellable finished goods"
 * (role flag, so Populated PCBs / other sellable sub-assemblies land here
 * too). Legacy `products` table is no longer the source; every write goes
 * through /items/*.
 *
 * The workspace label was renamed to "Assembled Products" (see modules.ts).
 * The URL path stays `/products/list` for backward-compatible bookmarks.
 */

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Package, Cpu, Search, RefreshCw, Plus, Layers, ExternalLink, AlertCircle, Boxes,
  GitBranch, Factory, Hammer, Grid2X2, Rows3, Download, IndianRupee,
  CheckSquare, Square, X, Loader2, Sparkles, Ban, Trash2, AlertTriangle,
} from "lucide-react"

// Bulk actions the server accepts. Kept as a const array so the toolbar
// can iterate over just the ones this module wants to expose.
type BulkAction = "activate" | "deactivate" | "discontinue" | "mark_finished" | "unmark_finished" | "delete"

type ItemType =
  | "raw"
  | "semi_assembled"
  | "assembled"
  | "consumable"
  | "asset"
  | "packaging"
type ItemStatus = "active" | "inactive" | "discontinued"

interface Item {
  id: string
  code: string
  name: string
  description: string | null
  categoryPath: string | null
  itemType: ItemType
  isFinishedGood: boolean
  baseUom: string
  minStock: number
  onHand: number
  status: ItemStatus
  variants: unknown[]
}

const STATUS_TONE: Record<ItemStatus, string> = {
  active:       "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  inactive:     "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20",
  discontinued: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
}

// The role sub-filter narrows the union — assembled items only, finished
// goods only, or both. Default "all" shows the full union.
type Role = "all" | "assembled" | "finished"

// Per-item stats from /api/products/stats. Missing key => "no Active BOM".
interface ProductStats {
  itemId: string
  activeBomVersion: string | null
  bomLineCount: number
  buildableQty: number | null
  openOrders: number
  unitCostRollup: number | null
  costCoverage: number
}

// Compact INR formatter — the cost rollup can span a few paise to lakhs, so
// we render with a k / L suffix when big.
function formatInr(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "—"
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}k`
  return `₹${value.toFixed(0)}`
}

type ViewMode = "cards" | "table"

// Suspense wrapper — useSearchParams reads a client-navigation boundary,
// so the actual list component lives one level down. Same pattern as
// /items/list.
export default function AssembledProductsListPage() {
  return (
    <React.Suspense fallback={null}>
      <AssembledProductsList />
    </React.Suspense>
  )
}

function AssembledProductsList() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Initial state seeded from URL — every filter is bookmarkable. Only
  // recognised values pass through, so a malformed ?status= silently
  // falls back to "all".
  const initialQ = searchParams.get("q") ?? ""
  const rawStatus = searchParams.get("status")
  const initialStatus: ItemStatus | "all" =
    rawStatus === "active" || rawStatus === "inactive" || rawStatus === "discontinued" ? rawStatus : "all"
  const rawRole = searchParams.get("role")
  const initialRole: Role =
    rawRole === "assembled" || rawRole === "finished" ? rawRole : "all"
  const rawView = searchParams.get("view")
  const initialView: ViewMode = rawView === "table" ? "table" : "cards"

  const [items, setItems] = React.useState<Item[]>([])
  const [stats, setStats] = React.useState<Map<string, ProductStats>>(new Map())
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [q, setQ] = React.useState(initialQ)
  const [statusFilter, setStatusFilter] = React.useState<ItemStatus | "all">(initialStatus)
  const [role, setRole] = React.useState<Role>(initialRole)
  const [view, setView] = React.useState<ViewMode>(initialView)

  // Row selection + bulk action state. Selection lives in memory — filters
  // that hide a selected row keep it selected so the count is honest, and
  // hitting Clear or a successful action drops the set.
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = React.useState<BulkAction | null>(null)
  const [bulkReport, setBulkReport] = React.useState<{
    action: BulkAction
    succeeded: number
    failed: Array<{ id: string; reason: string }>
  } | null>(null)
  const toggleOne = (id: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const clearSelection = () => setSelected(new Set())

  // Push filter state back into the URL so refresh / bookmark keeps the
  // same view. `replace` (not `push`) so the browser back button doesn't
  // fill up with every toggle.
  React.useEffect(() => {
    const params = new URLSearchParams()
    if (q.trim()) params.set("q", q.trim())
    if (statusFilter !== "all") params.set("status", statusFilter)
    if (role !== "all") params.set("role", role)
    if (view !== "cards") params.set("view", view)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, statusFilter, role, view])

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Independent module: fetches ONLY assembled items via the API's
      // itemType filter — no shared payload with /pcb-management or /items.
      // The union with `isFinishedGood` for populated PCBs happens in a
      // second, complementary call so a semi_assembled item flagged as a
      // finished good still shows up here without a giant client-side sift.
      const [assRes, finRes, statsRes] = await Promise.all([
        fetch("/api/items?itemType=assembled", { cache: "no-store" }),
        fetch("/api/items?itemType=semi_assembled", { cache: "no-store" }),
        fetch("/api/products/stats", { cache: "no-store" }),
      ])
      const [assBody, finBody, statsBody] = await Promise.all([
        assRes.json().catch(() => ({})),
        finRes.json().catch(() => ({})),
        statsRes.json().catch(() => ({})),
      ])
      if (!assRes.ok) throw new Error(assBody?.error?.message ?? `Request failed (${assRes.status})`)
      const assembled: Item[] = Array.isArray(assBody?.data) ? assBody.data : []
      const finished: Item[] = Array.isArray(finBody?.data)
        ? (finBody.data as Item[]).filter((it) => it.isFinishedGood)
        : []
      // Dedup on id — an assembled+finished item would appear in both.
      const merged = new Map<string, Item>()
      for (const it of assembled) merged.set(it.id, it)
      for (const it of finished) merged.set(it.id, it)
      setItems(Array.from(merged.values()))
      // Fold stats into a lookup map keyed by item id.
      const statsList: ProductStats[] = Array.isArray(statsBody?.data) ? statsBody.data : []
      const nextStats = new Map<string, ProductStats>()
      for (const s of statsList) nextStats.set(s.itemId, s)
      setStats(nextStats)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load items")
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

  const filtered = React.useMemo(() => {
    const query = q.trim().toLowerCase()
    return items.filter((it) => {
      if (role === "assembled" && it.itemType !== "assembled") return false
      if (role === "finished" && !it.isFinishedGood) return false
      if (statusFilter !== "all" && it.status !== statusFilter) return false
      if (query) {
        const hay = `${it.code} ${it.name} ${it.categoryPath ?? ""}`.toLowerCase()
        if (!hay.includes(query)) return false
      }
      return true
    })
  }, [items, q, statusFilter, role])

  const roleCounts = React.useMemo(() => ({
    all: items.length,
    assembled: items.filter((it) => it.itemType === "assembled").length,
    finished: items.filter((it) => it.isFinishedGood).length,
  }), [items])

  // visibleSelected are IDs that are both selected AND currently pass the
  // filter — the select-all header targets this set so it can't accidentally
  // toggle rows the user can't see.
  const visibleIds = React.useMemo(() => new Set(filtered.map((it) => it.id)), [filtered])
  const visibleSelected = React.useMemo(
    () => filtered.filter((it) => selected.has(it.id)),
    [filtered, selected],
  )
  const allVisibleSelected = filtered.length > 0 && filtered.every((it) => selected.has(it.id))
  const someVisibleSelected = visibleSelected.length > 0 && !allVisibleSelected
  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        for (const it of filtered) next.delete(it.id)
      } else {
        for (const it of filtered) next.add(it.id)
      }
      return next
    })
  }

  // Bulk action executor. Only touches IDs that are BOTH selected AND
  // currently visible (a filter change could hide a row after selection).
  // Client-side confirm on destructive actions (delete + discontinue).
  const runBulk = React.useCallback(async (action: BulkAction) => {
    if (bulkBusy) return
    const targetIds = filtered.filter((it) => selected.has(it.id)).map((it) => it.id)
    if (targetIds.length === 0) return
    if (action === "delete" && !confirm(`Soft-delete ${targetIds.length} item${targetIds.length === 1 ? "" : "s"}? Items with on-hand stock or live BOM references will be rejected individually.`)) return
    if (action === "discontinue" && !confirm(`Mark ${targetIds.length} item${targetIds.length === 1 ? "" : "s"} as discontinued?`)) return
    setBulkBusy(action)
    setBulkReport(null)
    try {
      const res = await fetch("/api/items/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: targetIds, action }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBulkReport({ action, succeeded: 0, failed: targetIds.map((id) => ({ id, reason: body?.error?.message ?? `Request failed (${res.status})` })) })
        return
      }
      const data = body?.data as { succeeded: string[]; failed: Array<{ id: string; reason: string }> }
      setBulkReport({ action, succeeded: data.succeeded.length, failed: data.failed })
      // Drop successful ids from selection so the toolbar reflects the remaining
      // failed rows — the user can retry or fix the underlying reason.
      setSelected((prev) => {
        const next = new Set(prev)
        for (const id of data.succeeded) next.delete(id)
        return next
      })
      // Refresh the list so status changes / soft-deletes are visible.
      await load()
    } finally {
      setBulkBusy(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, selected, bulkBusy])

  // CSV export of the currently filtered set. Columns match what the card
  // grid shows — including the assembled-only stats — so the export is
  // useful for reporting without post-processing. Everything is done
  // client-side; no separate endpoint needed.
  const exportCsv = React.useCallback(() => {
    const escape = (v: string | number | null | undefined) => {
      if (v == null) return ""
      const s = String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = [
      "Code", "Name", "Stage", "Finished good", "Status", "Category",
      "On hand", "UOM", "Active BOM", "BOM lines", "Buildable", "Open orders",
      "Est. cost / unit (INR)", "Cost coverage",
    ]
    const lines = [header.join(",")]
    for (const it of filtered) {
      const st = stats.get(it.id)
      lines.push([
        escape(it.code),
        escape(it.name),
        escape(it.itemType === "assembled" ? "Assembled" : "Semi-assembled"),
        escape(it.isFinishedGood ? "yes" : "no"),
        escape(it.status),
        escape(it.categoryPath ?? ""),
        escape(it.onHand),
        escape(it.baseUom),
        escape(st?.activeBomVersion ?? ""),
        escape(st?.bomLineCount ?? 0),
        escape(st?.buildableQty ?? ""),
        escape(st?.openOrders ?? 0),
        escape(st?.unitCostRollup != null ? st.unitCostRollup.toFixed(2) : ""),
        escape(st?.costCoverage != null ? `${Math.round(st.costCoverage * 100)}%` : ""),
      ].join(","))
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `assembled-products-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [filtered, stats])

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-muted-foreground flex items-center gap-2 font-medium">
            <span>Items</span><span>/</span>
            <span className="text-foreground font-semibold">Assembled Products</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Assembled Products
          </h1>
          <p className="text-sm text-muted-foreground">
            Assembled items plus every sellable sub-assembly (marked <span className="font-semibold text-emerald-600 dark:text-emerald-400">Finished</span>). Add or edit via the universal item flow.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          {/* View toggle — Cards / Table. Persisted in the URL as ?view=. */}
          <div className="inline-flex rounded-md border border-border bg-background p-0.5" role="group" aria-label="View mode">
            <button
              type="button"
              onClick={() => setView("cards")}
              className={`px-2.5 py-1.5 rounded-sm text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                view === "cards" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
              }`}
              title="Card view"
            >
              <Grid2X2 className="h-3.5 w-3.5" /> Cards
            </button>
            <button
              type="button"
              onClick={() => setView("table")}
              className={`px-2.5 py-1.5 rounded-sm text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                view === "table" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
              }`}
              title="Table view"
            >
              <Rows3 className="h-3.5 w-3.5" /> Table
            </button>
          </div>
          <Button variant="outline" className="gap-2 font-semibold border-border bg-background" onClick={exportCsv} disabled={loading || filtered.length === 0} title="Download the filtered list as CSV">
            <Download className="h-4 w-4" />
            <span>Export</span>
          </Button>
          <Button variant="outline" className="gap-2 font-semibold border-border bg-background" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
          <Button render={<Link href="/items/add?type=assembled" />} className="gap-2 font-semibold">
            <Plus className="h-4 w-4" />
            <span>Add item</span>
          </Button>
        </div>
      </div>

      {/* Search + role + status filter */}
      <div className="bg-card border border-border p-4 rounded-xl shadow-2xs space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search code, name, or category…"
              className="pl-9 bg-background border-border"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-semibold">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ItemStatus | "all")}
              className="bg-background border border-border rounded-lg text-xs p-2 outline-none focus:ring-1 focus:ring-primary cursor-pointer text-foreground font-semibold min-w-[120px]"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="discontinued">Discontinued</option>
            </select>
            <span className="text-xs text-muted-foreground font-mono">{filtered.length} / {items.length}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground font-semibold">Show:</span>
          {(["all", "assembled", "finished"] as Role[]).map((r) => {
            const active = role === r
            const label = r === "all" ? "All products" : r === "assembled" ? "Assembled only" : "Finished only"
            return (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={`px-3 py-1 text-xs rounded-full border transition-all cursor-pointer font-semibold select-none ${
                  active
                    ? "bg-primary/10 border-primary text-primary shadow-3xs"
                    : "bg-background border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {label} <span className="font-mono opacity-70">({roleCounts[r]})</span>
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div><div className="font-semibold">Failed to load</div><div className="text-xs opacity-80 font-mono">{error}</div></div>
        </div>
      )}

      {/* Bulk-action toolbar. Appears whenever any rows in the current filter
          are selected. The buttons touch only visible+selected ids so a
          hidden selection doesn't get mass-actioned by mistake. */}
      {visibleSelected.length > 0 && (
        <div className="sticky top-2 z-30 flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 backdrop-blur-sm px-3 py-2 shadow-md">
          <span className="text-xs font-bold text-primary">
            {visibleSelected.length} selected
            {selected.size > visibleSelected.length && (
              <span className="ml-1 text-muted-foreground font-medium">
                ({selected.size - visibleSelected.length} hidden by filters)
              </span>
            )}
          </span>
          <span className="text-muted-foreground/40">·</span>
          {[
            { action: "activate" as const, label: "Activate", icon: Sparkles, tone: "text-emerald-600 dark:text-emerald-400" },
            { action: "deactivate" as const, label: "Deactivate", icon: Ban, tone: "text-slate-600 dark:text-slate-400" },
            { action: "discontinue" as const, label: "Discontinue", icon: Ban, tone: "text-rose-600 dark:text-rose-400" },
            { action: "mark_finished" as const, label: "Mark Finished", icon: CheckSquare, tone: "text-emerald-600 dark:text-emerald-400" },
            { action: "unmark_finished" as const, label: "Unmark Finished", icon: Square, tone: "text-muted-foreground" },
            { action: "delete" as const, label: "Delete", icon: Trash2, tone: "text-destructive" },
          ].map(({ action, label, icon: Icon, tone }) => {
            const busy = bulkBusy === action
            return (
              <button
                key={action}
                type="button"
                onClick={() => void runBulk(action)}
                disabled={bulkBusy !== null}
                className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold transition-colors hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed ${tone}`}
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
                {label}
              </button>
            )
          })}
          <button
            type="button"
            onClick={clearSelection}
            disabled={bulkBusy !== null}
            className="ml-auto inline-flex items-center gap-1 rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        </div>
      )}

      {/* Bulk-run report. Green when nothing failed, red with per-id
          reasons when anything did — the failed rows stay selected so the
          user can fix and retry, matching the merger-page pattern. */}
      {bulkReport && (
        <div className={`rounded-xl border px-3 py-2 space-y-1 ${
          bulkReport.failed.length === 0
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-destructive/40 bg-destructive/5"
        }`}>
          <div className={`flex items-center gap-2 text-xs font-bold ${
            bulkReport.failed.length === 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"
          }`}>
            {bulkReport.failed.length === 0 ? <CheckSquare className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            Bulk {bulkReport.action.replace("_", " ")} — {bulkReport.succeeded} succeeded, {bulkReport.failed.length} failed
            <button
              type="button"
              onClick={() => setBulkReport(null)}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            >dismiss</button>
          </div>
          {bulkReport.failed.length > 0 && (
            <ul className="text-[11px] text-destructive space-y-0.5 max-h-32 overflow-y-auto">
              {bulkReport.failed.slice(0, 20).map((f) => (
                <li key={f.id}>
                  <span className="font-mono">{items.find((it) => it.id === f.id)?.code ?? f.id.slice(0, 8)}</span>
                  {" — "}{f.reason}
                </li>
              ))}
              {bulkReport.failed.length > 20 && (
                <li className="italic opacity-70">…{bulkReport.failed.length - 20} more</li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Card grid (view === "cards") */}
      {view === "cards" && (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {loading && Array.from({ length: 6 }).map((_, i) => (
          <Card key={`sk-${i}`} className="border border-border bg-card">
            <CardHeader className="pb-4"><Skeleton className="h-6 w-2/3" /></CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </CardContent>
          </Card>
        ))}

        {!loading && filtered.map((it) => {
          const isAssembled = it.itemType === "assembled"
          const Icon = isAssembled ? Package : Cpu
          const st = stats.get(it.id)
          const hasBom = Boolean(st?.activeBomVersion)
          return (
            <Card
              key={it.id}
              className={`flex flex-col transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 border bg-card group relative overflow-hidden cursor-pointer ${
                selected.has(it.id) ? "border-primary shadow-md ring-1 ring-primary/40" : "border-border"
              }`}
              onClick={() => router.push(`/items/details/${encodeURIComponent(it.id)}?from=products`)}
            >
              <div className={`absolute top-0 right-0 h-16 w-16 -mr-4 -mt-4 rounded-full transition-all group-hover:scale-110 ${isAssembled ? "bg-primary/5" : "bg-sky-500/5"}`} />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  {/* Selection checkbox — stopPropagation keeps the card
                      navigate-on-click behaviour unchanged. */}
                  <label
                    className="mt-1 shrink-0 cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                    title={selected.has(it.id) ? "Deselect this item" : "Select for bulk action"}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(it.id)}
                      onChange={() => toggleOne(it.id)}
                      className="h-4 w-4 cursor-pointer accent-primary"
                      aria-label={`Select ${it.code}`}
                    />
                  </label>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${isAssembled ? "bg-primary/10 text-primary border-primary/10" : "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/10"}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div className="font-bold text-sm text-foreground truncate">{it.name}</div>
                        {it.isFinishedGood && (
                          <span
                            className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400"
                            title="Sellable finished good"
                          >
                            Finished
                          </span>
                        )}
                        {hasBom ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary"
                            title={`${st!.bomLineCount} lines in ${st!.activeBomVersion} Active`}
                          >
                            <GitBranch className="h-2.5 w-2.5" />
                            {st!.activeBomVersion} · {st!.bomLineCount}
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400"
                            title="No Active BOM version yet — build one from the item's details page"
                          >
                            no BOM
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-primary">{it.code}</div>
                    </div>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border ${STATUS_TONE[it.status]}`}>{it.status}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {it.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{it.description}</p>
                )}
                <div className="grid grid-cols-4 gap-1.5 text-center">
                  <div className="rounded-lg border border-border bg-muted/20 px-1.5 py-2">
                    <div className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">Stage</div>
                    <div className="text-[11px] font-semibold mt-0.5 truncate" title={isAssembled ? "Assembled" : "Semi-assembled"}>
                      {isAssembled ? "Assy" : "Sub"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 px-1.5 py-2">
                    <div className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">On hand</div>
                    <div
                      className={`text-[11px] font-mono font-bold mt-0.5 ${it.onHand === 0 ? "text-muted-foreground/60" : it.minStock > 0 && it.onHand < it.minStock ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}
                      title={`${it.onHand.toLocaleString()} ${it.baseUom}`}
                    >
                      {it.onHand.toLocaleString()}
                    </div>
                  </div>
                  <div
                    className="rounded-lg border border-border bg-muted/20 px-1.5 py-2"
                    title={hasBom
                      ? `Buildable from current stock: ${st?.buildableQty?.toLocaleString() ?? 0} units`
                      : "Buildable qty needs an Active BOM"}
                  >
                    <div className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center justify-center gap-1">
                      <Hammer className="h-2.5 w-2.5" /> Build
                    </div>
                    <div className={`text-[11px] font-mono font-bold mt-0.5 ${
                      !hasBom ? "text-muted-foreground/60"
                      : (st?.buildableQty ?? 0) === 0 ? "text-destructive"
                      : (st?.buildableQty ?? 0) < 10 ? "text-amber-600 dark:text-amber-400"
                      : "text-emerald-600 dark:text-emerald-400"
                    }`}>
                      {hasBom ? (st?.buildableQty ?? 0).toLocaleString() : "—"}
                    </div>
                  </div>
                  <div
                    className="rounded-lg border border-border bg-muted/20 px-1.5 py-2"
                    title={`${st?.openOrders ?? 0} open production orders (Draft, Ready, In Progress)`}
                  >
                    <div className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center justify-center gap-1">
                      <Factory className="h-2.5 w-2.5" /> Orders
                    </div>
                    <div className={`text-[11px] font-mono font-bold mt-0.5 ${
                      (st?.openOrders ?? 0) === 0 ? "text-muted-foreground/60" : "text-foreground"
                    }`}>
                      {(st?.openOrders ?? 0).toLocaleString()}
                    </div>
                  </div>
                </div>
                {/* Cost roll-up — shown only when the item has an Active BOM.
                    The chip flags incomplete pricing coverage so operators
                    don't take the number as gospel when leaves are unpriced. */}
                {hasBom && (
                  <div
                    className="flex items-center justify-between rounded-md border border-border/60 bg-muted/10 px-2 py-1 text-[10px]"
                    title={st?.costCoverage === 1
                      ? "Every BOM leaf has a known cost (lot receipt or supplier price)."
                      : `${Math.round((st?.costCoverage ?? 0) * 100)}% of BOM leaves priced — the rest are unvalued, so the rollup is a lower bound.`}
                  >
                    <span className="inline-flex items-center gap-1 font-semibold text-muted-foreground">
                      <IndianRupee className="h-2.5 w-2.5" /> Est. cost / unit
                    </span>
                    <span className={`font-mono font-bold ${st?.costCoverage === 1 ? "text-foreground" : "text-amber-600 dark:text-amber-400"}`}>
                      {formatInr(st?.unitCostRollup ?? 0)}
                      {st?.costCoverage !== 1 && st?.costCoverage != null && (
                        <span className="ml-1 opacity-70">({Math.round(st.costCoverage * 100)}%)</span>
                      )}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    render={<Link href={`/items/details/${encodeURIComponent(it.id)}?from=products#bom-section`} />}
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Layers className="h-3.5 w-3.5" /> BOM
                  </Button>
                  <Button
                    render={<Link href={`/items/details/${encodeURIComponent(it.id)}?from=products`} />}
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Details <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
      )}

      {/* Table view (view === "table") — compact scan of the same filtered
          rows, same underlying stats. */}
      {view === "table" && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px] border-b border-border">
                <tr>
                  <th className="px-3 py-2 w-9">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      ref={(el) => { if (el) el.indeterminate = someVisibleSelected }}
                      onChange={toggleAllVisible}
                      className="h-3.5 w-3.5 cursor-pointer accent-primary"
                      aria-label={allVisibleSelected ? "Deselect all visible" : "Select all visible"}
                    />
                  </th>
                  <th className="px-4 py-2 text-left font-bold">Code</th>
                  <th className="px-4 py-2 text-left font-bold">Name</th>
                  <th className="px-4 py-2 text-left font-bold">Category</th>
                  <th className="px-4 py-2 text-left font-bold">BOM</th>
                  <th className="px-4 py-2 text-right font-bold">On hand</th>
                  <th className="px-4 py-2 text-right font-bold">Build</th>
                  <th className="px-4 py-2 text-right font-bold">Est. cost</th>
                  <th className="px-4 py-2 text-right font-bold">Orders</th>
                  <th className="px-4 py-2 text-left font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    {Array.from({ length: 10 }).map((__, j) => (
                      <td key={j} className="px-4 py-2"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))}
                {!loading && filtered.map((it) => {
                  const st = stats.get(it.id)
                  const hasBom = Boolean(st?.activeBomVersion)
                  return (
                    <tr
                      key={it.id}
                      onClick={() => router.push(`/items/details/${encodeURIComponent(it.id)}?from=products`)}
                      className={`cursor-pointer hover:bg-muted/20 transition-colors ${
                        selected.has(it.id) ? "bg-primary/5" : ""
                      }`}
                    >
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(it.id)}
                          onChange={() => toggleOne(it.id)}
                          className="h-3.5 w-3.5 cursor-pointer accent-primary"
                          aria-label={`Select ${it.code}`}
                        />
                      </td>
                      <td className="px-4 py-2 font-mono font-bold text-primary whitespace-nowrap">{it.code}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold truncate max-w-[200px]" title={it.name}>{it.name}</span>
                          {it.isFinishedGood && (
                            <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700 dark:text-emerald-400" title="Sellable finished good">Finished</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground truncate max-w-[180px]" title={it.categoryPath ?? "—"}>{it.categoryPath?.split(" › ").pop() ?? "—"}</td>
                      <td className="px-4 py-2">
                        {hasBom ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary" title={`${st!.bomLineCount} lines`}>
                            <GitBranch className="h-2.5 w-2.5" /> {st!.activeBomVersion} · {st!.bomLineCount}
                          </span>
                        ) : (
                          <span className="text-[10px] italic text-muted-foreground/60">no BOM</span>
                        )}
                      </td>
                      <td className={`px-4 py-2 text-right font-mono ${it.onHand === 0 ? "text-muted-foreground/60" : it.minStock > 0 && it.onHand < it.minStock ? "text-amber-600 dark:text-amber-400 font-bold" : "text-foreground"}`}>{it.onHand.toLocaleString()}</td>
                      <td className={`px-4 py-2 text-right font-mono font-bold ${
                        !hasBom ? "text-muted-foreground/60"
                        : (st?.buildableQty ?? 0) === 0 ? "text-destructive"
                        : (st?.buildableQty ?? 0) < 10 ? "text-amber-600 dark:text-amber-400"
                        : "text-emerald-600 dark:text-emerald-400"
                      }`}>
                        {hasBom ? (st?.buildableQty ?? 0).toLocaleString() : "—"}
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-mono ${
                          !hasBom ? "text-muted-foreground/60"
                          : (st?.costCoverage ?? 1) < 1 ? "text-amber-600 dark:text-amber-400"
                          : "text-foreground font-semibold"
                        }`}
                        title={hasBom && (st?.costCoverage ?? 1) < 1 ? `${Math.round((st?.costCoverage ?? 0) * 100)}% priced` : undefined}
                      >
                        {hasBom ? formatInr(st?.unitCostRollup ?? 0) : "—"}
                      </td>
                      <td className={`px-4 py-2 text-right font-mono ${(st?.openOrders ?? 0) === 0 ? "text-muted-foreground/60" : "text-foreground font-bold"}`}>{(st?.openOrders ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border ${STATUS_TONE[it.status]}`}>{it.status}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <Card className="border border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center text-muted-foreground">
            <Boxes className="h-8 w-8 opacity-30" />
            <div className="text-sm font-medium">
              {items.length === 0
                ? "No assembled products or finished goods yet"
                : "No items match your search and filters"}
            </div>
            {items.length === 0 ? (
              <Button render={<Link href="/items/add?type=assembled" />} variant="outline" className="gap-2 mt-1">
                <Plus className="h-4 w-4" /> Add the first one
              </Button>
            ) : (
              (q.trim() || statusFilter !== "all" || role !== "all") && (
                <button onClick={() => { setQ(""); setStatusFilter("all"); setRole("all") }} className="text-xs text-primary hover:underline font-semibold cursor-pointer">
                  Reset filters
                </button>
              )
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
