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
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Package, Cpu, Search, RefreshCw, Plus, Layers, ExternalLink, AlertCircle, Boxes,
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

export default function AssembledProductsListPage() {
  const router = useRouter()
  const [items, setItems] = React.useState<Item[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [q, setQ] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<ItemStatus | "all">("all")
  const [role, setRole] = React.useState<Role>("all")

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/items", { cache: "no-store" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error?.message ?? `Request failed (${res.status})`)
      const all: Item[] = Array.isArray(body?.data) ? body.data : []
      setItems(all.filter((it) => it.itemType === "assembled" || it.isFinishedGood))
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

      {/* Card grid */}
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
          return (
            <Card
              key={it.id}
              className="flex flex-col transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 border border-border bg-card group relative overflow-hidden cursor-pointer"
              onClick={() => router.push(`/items/details/${encodeURIComponent(it.id)}`)}
            >
              <div className={`absolute top-0 right-0 h-16 w-16 -mr-4 -mt-4 rounded-full transition-all group-hover:scale-110 ${isAssembled ? "bg-primary/5" : "bg-sky-500/5"}`} />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${isAssembled ? "bg-primary/10 text-primary border-primary/10" : "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/10"}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <div className="font-bold text-sm text-foreground truncate">{it.name}</div>
                        {it.isFinishedGood && (
                          <span
                            className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400"
                            title="Sellable finished good"
                          >
                            Finished
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
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-border bg-muted/20 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Stage</div>
                    <div className="text-xs font-semibold mt-0.5">{isAssembled ? "Assembled" : "Semi-assembled"}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">On hand</div>
                    <div className={`text-xs font-mono font-bold mt-0.5 ${it.onHand === 0 ? "text-muted-foreground/60" : it.minStock > 0 && it.onHand < it.minStock ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>{it.onHand.toLocaleString()}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/20 p-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">UOM</div>
                    <div className="text-xs font-mono font-bold mt-0.5">{it.baseUom}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    render={<Link href={`/items/${encodeURIComponent(it.id)}/bom`} />}
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Layers className="h-3.5 w-3.5" /> BOM
                  </Button>
                  <Button
                    render={<Link href={`/items/details/${encodeURIComponent(it.id)}`} />}
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
