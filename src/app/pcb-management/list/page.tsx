"use client"

/**
 * Semi-assembled workspace list.
 *
 * Post-consolidation this page reads the universal items master and filters
 * to `itemType === 'semi_assembled'` — PCB revisions and any other sub-
 * assembly (populated PCBs, mechanical sub-assemblies, etc.) all show up
 * here in one list. Legacy `pcbs` / `pcb_revisions` tables are no longer the
 * source; every write goes through /items/*.
 *
 * The workspace label was renamed to "Semi-assembled" (see modules.ts). The
 * URL path stays `/pcb-management/list` for backward-compatible bookmarks.
 */

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Cpu, Search, RefreshCw, Plus, Layers, ExternalLink, AlertCircle, Boxes,
  GitBranch, Users, Grid2X2, Rows3, Download, Hammer,
} from "lucide-react"

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
  // Board specs from /api/items — used by the solder-type filter and the
  // spec strip on each card.
  solderType: "SMD" | "DIP" | null
  footprint: string | null
  variants: unknown[]
}

// Stats from /api/pcb/stats — missing key => "no BOM versions, not used anywhere".
interface BomVersionSummary {
  id: string
  version: string
  status: string
  lineCount: number
}
interface ParentSummary { id: string; code: string; name: string }
interface SemiStats {
  itemId: string
  bomVersions: BomVersionSummary[]
  usedIn: ParentSummary[]
  usedInCount: number
  buildableQty: number | null
}

const STATUS_TONE: Record<ItemStatus, string> = {
  active:       "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  inactive:     "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20",
  discontinued: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
}

// Solder-type filter — semi_assembled-specific because PCB revisions have
// a solder type but a mechanical sub-assembly usually doesn't.
type SolderFilter = "all" | "smd" | "dip" | "unspecified"

type ViewMode = "cards" | "table"

// Suspense wrapper — useSearchParams needs a client boundary, so the list
// body lives in a helper component. Matches the /products/list pattern.
export default function SemiAssembledListPage() {
  return (
    <React.Suspense fallback={null}>
      <SemiAssembledList />
    </React.Suspense>
  )
}

function SemiAssembledList() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Seed every filter + view mode from the URL so bookmarks and refresh
  // keep the same visual state. Only recognised values pass; anything
  // else silently falls back to the default.
  const initialQ = searchParams.get("q") ?? ""
  const rawStatus = searchParams.get("status")
  const initialStatus: ItemStatus | "all" =
    rawStatus === "active" || rawStatus === "inactive" || rawStatus === "discontinued" ? rawStatus : "all"
  const rawSolder = searchParams.get("solder")
  const initialSolder: SolderFilter =
    rawSolder === "smd" || rawSolder === "dip" || rawSolder === "unspecified" ? rawSolder : "all"
  const rawView = searchParams.get("view")
  const initialView: ViewMode = rawView === "table" ? "table" : "cards"

  const [items, setItems] = React.useState<Item[]>([])
  const [stats, setStats] = React.useState<Map<string, SemiStats>>(new Map())
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [q, setQ] = React.useState(initialQ)
  const [statusFilter, setStatusFilter] = React.useState<ItemStatus | "all">(initialStatus)
  const [solder, setSolder] = React.useState<SolderFilter>(initialSolder)
  const [view, setView] = React.useState<ViewMode>(initialView)

  // Push filter state into the URL — router.replace so back-button
  // isn't polluted by every toggle. Skip when default so a clean tile
  // click stays on a clean URL.
  React.useEffect(() => {
    const params = new URLSearchParams()
    if (q.trim()) params.set("q", q.trim())
    if (statusFilter !== "all") params.set("status", statusFilter)
    if (solder !== "all") params.set("solder", solder)
    if (view !== "cards") params.set("view", view)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, statusFilter, solder, view])

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Independent module: fetches ONLY semi_assembled items via the API's
      // itemType filter — no shared payload with /products or /items/list.
      const [itemsRes, statsRes] = await Promise.all([
        fetch("/api/items?itemType=semi_assembled", { cache: "no-store" }),
        fetch("/api/pcb/stats", { cache: "no-store" }),
      ])
      const [itemsBody, statsBody] = await Promise.all([
        itemsRes.json().catch(() => ({})),
        statsRes.json().catch(() => ({})),
      ])
      if (!itemsRes.ok) throw new Error(itemsBody?.error?.message ?? `Request failed (${itemsRes.status})`)
      const all: Item[] = Array.isArray(itemsBody?.data) ? itemsBody.data : []
      setItems(all)
      const statsList: SemiStats[] = Array.isArray(statsBody?.data) ? statsBody.data : []
      const nextStats = new Map<string, SemiStats>()
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
      if (statusFilter !== "all" && it.status !== statusFilter) return false
      if (solder === "smd" && it.solderType !== "SMD") return false
      if (solder === "dip" && it.solderType !== "DIP") return false
      if (solder === "unspecified" && it.solderType !== null) return false
      if (query) {
        const hay = `${it.code} ${it.name} ${it.categoryPath ?? ""}`.toLowerCase()
        if (!hay.includes(query)) return false
      }
      return true
    })
  }, [items, q, statusFilter, solder])

  const solderCounts = React.useMemo(() => ({
    all: items.length,
    smd: items.filter((it) => it.solderType === "SMD").length,
    dip: items.filter((it) => it.solderType === "DIP").length,
    unspecified: items.filter((it) => it.solderType === null).length,
  }), [items])

  // CSV export of the currently filtered set. Columns include the
  // semi_assembled-specific signals (Active + Draft revision, used-in
  // count) so the export is useful for BOM audits without a follow-up
  // query. Everything client-side.
  const exportCsv = React.useCallback(() => {
    const escape = (v: string | number | null | undefined) => {
      if (v == null) return ""
      const s = String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = [
      "Code", "Name", "Category", "Solder", "Footprint", "Status", "On hand", "UOM",
      "Active BOM", "Draft BOM", "Used in (parents)", "Buildable",
    ]
    const lines = [header.join(",")]
    for (const it of filtered) {
      const st = stats.get(it.id)
      const active = st?.bomVersions.find((v) => v.status === "Active")
      const draft = st?.bomVersions.find((v) => v.status === "Draft")
      lines.push([
        escape(it.code),
        escape(it.name),
        escape(it.categoryPath ?? ""),
        escape(it.solderType ?? ""),
        escape(it.footprint ?? ""),
        escape(it.status),
        escape(it.onHand),
        escape(it.baseUom),
        escape(active ? `${active.version} (${active.lineCount} lines)` : ""),
        escape(draft ? `${draft.version} (${draft.lineCount} lines)` : ""),
        escape(st?.usedInCount ?? 0),
        escape(st?.buildableQty ?? ""),
      ].join(","))
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `semi-assembled-${new Date().toISOString().slice(0, 10)}.csv`
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
            <span className="text-foreground font-semibold">Semi-assembled</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Semi-assembled
          </h1>
          <p className="text-sm text-muted-foreground">
            PCB revisions and any other sub-assembly built in-house. Add or edit via the universal item flow.
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
          <Button render={<Link href="/items/add?type=semi_assembled" />} className="gap-2 font-semibold">
            <Plus className="h-4 w-4" />
            <span>Add item</span>
          </Button>
        </div>
      </div>

      {/* Search + solder-type filter + status filter */}
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
        {/* Solder-type chips — module-specific (a PCB revision has SMD/DIP,
            a mechanical sub-assembly usually leaves it blank). */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground font-semibold">Solder:</span>
          {(["all", "smd", "dip", "unspecified"] as SolderFilter[]).map((s) => {
            const active = solder === s
            const label = s === "all" ? "All" : s === "smd" ? "SMD" : s === "dip" ? "DIP" : "Unspecified"
            return (
              <button
                key={s}
                onClick={() => setSolder(s)}
                className={`px-3 py-1 text-xs rounded-full border transition-all cursor-pointer font-semibold select-none ${
                  active
                    ? "bg-primary/10 border-primary text-primary shadow-3xs"
                    : "bg-background border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {label} <span className="font-mono opacity-70">({solderCounts[s]})</span>
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
          const st = stats.get(it.id)
          const versions = st?.bomVersions ?? []
          const activeVersion = versions.find((v) => v.status === "Active")
          const draftVersion = versions.find((v) => v.status === "Draft")
          const usedIn = st?.usedIn ?? []
          const usedInCount = st?.usedInCount ?? 0
          return (
          <Card
            key={it.id}
            className="flex flex-col transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 border border-border bg-card group relative overflow-hidden cursor-pointer"
            onClick={() => router.push(`/items/details/${encodeURIComponent(it.id)}?from=pcb`)}
          >
            <div className="absolute top-0 right-0 h-16 w-16 -mr-4 -mt-4 rounded-full bg-sky-500/5 transition-all group-hover:scale-110" />
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/10">
                    <Cpu className="h-5 w-5" />
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
                      {it.solderType && (
                        <span
                          className="inline-flex items-center rounded-full border border-border bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground"
                          title={`Solder type: ${it.solderType}`}
                        >
                          {it.solderType}
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
              {/* Revision strip: every BOM version at a glance. Missing =
                  no BOM yet on this sub-assembly. */}
              <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                <span className="inline-flex items-center gap-1 text-muted-foreground font-semibold">
                  <GitBranch className="h-3 w-3" /> Revisions:
                </span>
                {versions.length === 0 ? (
                  <span className="italic text-muted-foreground/60">none</span>
                ) : (
                  <>
                    {activeVersion && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-bold text-emerald-700 dark:text-emerald-400"
                        title={`${activeVersion.lineCount} lines`}
                      >
                        {activeVersion.version} Active
                      </span>
                    )}
                    {draftVersion && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-bold text-amber-600 dark:text-amber-400"
                        title={`${draftVersion.lineCount} lines · unresolved`}
                      >
                        {draftVersion.version} Draft
                      </span>
                    )}
                    {versions.length > (activeVersion ? 1 : 0) + (draftVersion ? 1 : 0) && (
                      <span
                        className="inline-flex items-center rounded-full border border-border bg-muted px-1.5 py-0.5 font-bold text-muted-foreground"
                        title={versions.map((v) => `${v.version} ${v.status}`).join(" · ")}
                      >
                        +{versions.length - (activeVersion ? 1 : 0) - (draftVersion ? 1 : 0)} older
                      </span>
                    )}
                  </>
                )}
              </div>
              {/* Used-in strip: which assembled parents consume this. */}
              <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                <span className="inline-flex items-center gap-1 text-muted-foreground font-semibold">
                  <Users className="h-3 w-3" /> Used in:
                </span>
                {usedInCount === 0 ? (
                  <span className="italic text-muted-foreground/60">not referenced yet</span>
                ) : (
                  <>
                    {usedIn.map((p) => (
                      <Link
                        key={p.id}
                        href={`/items/details/${encodeURIComponent(p.id)}?from=pcb`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center rounded-full border border-primary/25 bg-primary/5 px-1.5 py-0.5 font-mono font-bold text-primary hover:bg-primary/15 truncate max-w-[10rem]"
                        title={p.name}
                      >
                        {p.code}
                      </Link>
                    ))}
                    {usedInCount > usedIn.length && (
                      <span
                        className="inline-flex items-center rounded-full border border-border bg-muted px-1.5 py-0.5 font-bold text-muted-foreground"
                        title={`${usedInCount - usedIn.length} more assemblies use this item`}
                      >
                        +{usedInCount - usedIn.length}
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="grid grid-cols-4 gap-1.5 text-center">
                <div className="rounded-lg border border-border bg-muted/20 px-1.5 py-2">
                  <div className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">Category</div>
                  <div className="text-[11px] font-semibold truncate mt-0.5" title={it.categoryPath ?? "—"}>{it.categoryPath?.split(" › ").pop() ?? "—"}</div>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 px-1.5 py-2">
                  <div className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">On hand</div>
                  <div className={`text-[11px] font-mono font-bold mt-0.5 ${it.onHand === 0 ? "text-muted-foreground/60" : it.minStock > 0 && it.onHand < it.minStock ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>{it.onHand.toLocaleString()}</div>
                </div>
                <div
                  className="rounded-lg border border-border bg-muted/20 px-1.5 py-2"
                  title={st?.buildableQty != null
                    ? `Buildable from current raw stock: ${st.buildableQty.toLocaleString()} units`
                    : "Buildable qty needs an Active BOM"}
                >
                  <div className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center justify-center gap-1">
                    <Hammer className="h-2.5 w-2.5" /> Build
                  </div>
                  <div className={`text-[11px] font-mono font-bold mt-0.5 ${
                    st?.buildableQty == null ? "text-muted-foreground/60"
                    : st.buildableQty === 0 ? "text-destructive"
                    : st.buildableQty < 10 ? "text-amber-600 dark:text-amber-400"
                    : "text-emerald-600 dark:text-emerald-400"
                  }`}>
                    {st?.buildableQty != null ? st.buildableQty.toLocaleString() : "—"}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 px-1.5 py-2">
                  <div className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">Footprint</div>
                  <div className="text-[11px] font-mono font-bold mt-0.5 truncate" title={it.footprint ?? "—"}>{it.footprint ?? "—"}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  render={<Link href={`/items/details/${encodeURIComponent(it.id)}?from=pcb#bom-section`} />}
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Layers className="h-3.5 w-3.5" /> BOM
                </Button>
                <Button
                  render={<Link href={`/items/details/${encodeURIComponent(it.id)}?from=pcb`} />}
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

      {/* Table view (view === "table") — compact scan of the same rows,
          same underlying stats. */}
      {view === "table" && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px] border-b border-border">
                <tr>
                  <th className="px-4 py-2 text-left font-bold">Code</th>
                  <th className="px-4 py-2 text-left font-bold">Name</th>
                  <th className="px-4 py-2 text-left font-bold">Solder</th>
                  <th className="px-4 py-2 text-left font-bold">Footprint</th>
                  <th className="px-4 py-2 text-left font-bold">Active / Draft</th>
                  <th className="px-4 py-2 text-right font-bold">Used in</th>
                  <th className="px-4 py-2 text-right font-bold">On hand</th>
                  <th className="px-4 py-2 text-right font-bold">Build</th>
                  <th className="px-4 py-2 text-left font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <td key={j} className="px-4 py-2"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))}
                {!loading && filtered.map((it) => {
                  const st = stats.get(it.id)
                  const active = st?.bomVersions.find((v) => v.status === "Active")
                  const draft = st?.bomVersions.find((v) => v.status === "Draft")
                  return (
                    <tr
                      key={it.id}
                      onClick={() => router.push(`/items/details/${encodeURIComponent(it.id)}?from=pcb`)}
                      className="cursor-pointer hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-2 font-mono font-bold text-primary whitespace-nowrap">{it.code}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold truncate max-w-[200px]" title={it.name}>{it.name}</span>
                          {it.isFinishedGood && (
                            <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700 dark:text-emerald-400" title="Sellable finished good">Finished</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 font-mono text-muted-foreground">{it.solderType ?? "—"}</td>
                      <td className="px-4 py-2 font-mono text-muted-foreground truncate max-w-[140px]" title={it.footprint ?? "—"}>{it.footprint ?? "—"}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          {active && (
                            <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400" title={`${active.lineCount} lines`}>
                              {active.version} A
                            </span>
                          )}
                          {draft && (
                            <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400" title={`${draft.lineCount} lines`}>
                              {draft.version} D
                            </span>
                          )}
                          {!active && !draft && (
                            <span className="text-[10px] italic text-muted-foreground/60">none</span>
                          )}
                        </div>
                      </td>
                      <td className={`px-4 py-2 text-right font-mono ${(st?.usedInCount ?? 0) === 0 ? "text-muted-foreground/60" : "text-foreground font-bold"}`}>{(st?.usedInCount ?? 0).toLocaleString()}</td>
                      <td className={`px-4 py-2 text-right font-mono ${it.onHand === 0 ? "text-muted-foreground/60" : it.minStock > 0 && it.onHand < it.minStock ? "text-amber-600 dark:text-amber-400 font-bold" : "text-foreground"}`}>{it.onHand.toLocaleString()}</td>
                      <td className={`px-4 py-2 text-right font-mono font-bold ${
                        st?.buildableQty == null ? "text-muted-foreground/60"
                        : st.buildableQty === 0 ? "text-destructive"
                        : st.buildableQty < 10 ? "text-amber-600 dark:text-amber-400"
                        : "text-emerald-600 dark:text-emerald-400"
                      }`}>
                        {st?.buildableQty != null ? st.buildableQty.toLocaleString() : "—"}
                      </td>
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
                ? "No semi-assembled items in this tenant yet"
                : "No items match your search and filters"}
            </div>
            {items.length === 0 ? (
              <Button render={<Link href="/items/add?type=semi_assembled" />} variant="outline" className="gap-2 mt-1">
                <Plus className="h-4 w-4" /> Add the first one
              </Button>
            ) : (
              (q.trim() || statusFilter !== "all" || solder !== "all") && (
                <button onClick={() => { setQ(""); setStatusFilter("all"); setSolder("all") }} className="text-xs text-primary hover:underline font-semibold cursor-pointer">
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
