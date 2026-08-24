"use client"

/**
 * Inventory — rebuilt on the universal `items` master.
 *
 * Shows EVERY item that can hold stock (legacy components AND universally-created
 * items alike — F2 backfilled all legacy rows into `items`, so one list covers
 * both). On-hand, valuation, and status come from `/api/items` (F5.5 rollup).
 * Stock In/Out goes through the universal `ItemStockMoveDialog` (posts
 * item_variant_id). Expanding a row lazily loads its stock breakdown + movement
 * history from `/api/items/[id]/stock` and `/api/items/[id]/ledger`.
 *
 * Replaces the legacy CBV/component-scoped inventory page.
 */
import * as React from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { DragScrollArea } from "@/components/ui/drag-scroll-area"
import { StatStrip } from "@/components/stat-strip"
import {
  Search, X, ChevronDown, Package, Landmark, Boxes, AlertTriangle, ShieldAlert,
  ArrowDownToLine, ArrowUpFromLine, ArrowUpRight, Nut, Cpu, Laptop, Wrench, CheckCircle2, History, Layers,
} from "lucide-react"
import { formatINR } from "@/lib/catalog"
import { extractError } from "@/lib/api-error"
import { ItemStockMoveDialog, type StockMoveItem } from "@/components/inventory/item-stock-move-dialog"

type ItemType = "raw" | "semi_assembled" | "assembled" | "consumable" | "asset" | "packaging"
type ItemStatus = "active" | "inactive" | "discontinued"
type StockStatus = "Healthy" | "Low" | "Out of Stock"

interface Variant {
  id: string; sourceKind: "purchased" | "manufactured"; brandSlug: string | null; partNo: string | null; isDefault: boolean
}
interface Item {
  id: string; code: string; genericPn: string | null; name: string
  itemType: ItemType; baseUom: string; categoryPath: string | null
  minStock: number; reorderQty: number; status: ItemStatus
  onHand: number; stockValue: number; lastMovementAt: string | null
  variants: Variant[]
}

const TYPE_ICON: Record<ItemType, React.ComponentType<{ className?: string }>> = {
  raw: Nut, semi_assembled: Cpu, assembled: Package, consumable: Boxes, asset: Laptop, packaging: Wrench,
}
const TYPE_META: Record<ItemType, { label: string; tone: string }> = {
  raw:            { label: "Raw",          tone: "bg-primary/10 text-primary border-primary/20" },
  semi_assembled: { label: "Sub-assembly", tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20" },
  assembled:      { label: "Finished",     tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  consumable:     { label: "Consumable",   tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  asset:          { label: "Asset",        tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20" },
  packaging:      { label: "Packaging",    tone: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
}

/** Relative "time ago" for the last-movement column. */
function timeAgo(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return "—"
  const days = Math.floor((Date.now() - d) / 86_400_000)
  if (days <= 0) return "today"
  if (days === 1) return "1d ago"
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

const STATUS_STYLE: Record<StockStatus, { pill: string; dot: string; bar: string }> = {
  Healthy:        { pill: "border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10", dot: "bg-emerald-500", bar: "bg-emerald-500" },
  Low:            { pill: "border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-500/10",         dot: "bg-amber-500",   bar: "bg-amber-500" },
  "Out of Stock": { pill: "border-destructive/30 text-destructive bg-destructive/10",                       dot: "bg-destructive", bar: "bg-destructive" },
}

function stockStatus(it: Item): StockStatus {
  if (it.onHand <= 0) return "Out of Stock"
  if (it.minStock > 0 && it.onHand < it.minStock) return "Low"
  return "Healthy"
}

// ── expanded-row payloads (lazy) ──
interface StockBreakdown {
  byWarehouse: { warehouseId: string; code: string; onHand: number }[]
  byLot: { lotNo: string; brandSlug: string | null; supplierName: string | null; receivedDate: string | null; expiryDate: string | null; onHand: number; value: number }[]
}
interface LedgerRow {
  id: string; type: string; qtyDelta: number; warehouseCode: string | null; locationCode: string | null
  lotNo: string | null; supplierName: string | null; reason: string | null; createdAt: string
}

export default function InventoryPage() {
  const [items, setItems] = React.useState<Item[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<ItemType | "all">("all")
  const [statusFilter, setStatusFilter] = React.useState<StockStatus | "All">("All")
  const [expanded, setExpanded] = React.useState<string | null>(null)
  const [breakdown, setBreakdown] = React.useState<Record<string, { stock: StockBreakdown; ledger: LedgerRow[] } | "loading">>({})
  const [move, setMove] = React.useState<{ item: StockMoveItem; mode: "in" | "out" } | null>(null)
  const [toast, setToast] = React.useState<string | null>(null)

  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 3000) }

  const load = React.useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch("/api/items", { cache: "no-store" })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const body = await res.json() as { data: Item[] }
      setItems(body.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inventory")
    } finally { setLoading(false) }
  }, [])
  React.useEffect(() => { void load() }, [load])

  const loadBreakdown = React.useCallback(async (id: string) => {
    setBreakdown((p) => ({ ...p, [id]: "loading" }))
    try {
      const [sRes, lRes] = await Promise.all([
        fetch(`/api/items/${id}/stock`, { cache: "no-store" }),
        fetch(`/api/items/${id}/ledger`, { cache: "no-store" }),
      ])
      const sBody = sRes.ok ? await sRes.json() : null
      const lBody = lRes.ok ? await lRes.json() : null
      setBreakdown((p) => ({ ...p, [id]: { stock: sBody?.data ?? { byWarehouse: [], byLot: [] }, ledger: lBody?.data ?? [] } }))
    } catch {
      setBreakdown((p) => ({ ...p, [id]: { stock: { byWarehouse: [], byLot: [] }, ledger: [] } }))
    }
  }, [])

  const toggleRow = (id: string) => {
    const next = expanded === id ? null : id
    setExpanded(next)
    if (next && !breakdown[next]) void loadBreakdown(next)
  }

  const stats = React.useMemo(() => {
    let value = 0, low = 0, out = 0
    for (const it of items) {
      value += it.stockValue
      const s = stockStatus(it)
      if (s === "Low") low++
      else if (s === "Out of Stock") out++
    }
    return { value, low, out, skus: items.length }
  }, [items])

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((it) => {
      if (typeFilter !== "all" && it.itemType !== typeFilter) return false
      if (statusFilter !== "All" && stockStatus(it) !== statusFilter) return false
      if (q) {
        const hay = `${it.code} ${it.genericPn ?? ""} ${it.name} ${it.categoryPath ?? ""} ${it.variants.map((v) => `${v.brandSlug ?? ""} ${v.partNo ?? ""}`).join(" ")}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, query, typeFilter, statusFilter])

  const toMoveItem = (it: Item): StockMoveItem => ({
    id: it.id, code: it.code, name: it.name, baseUom: it.baseUom,
    variants: it.variants.map((v) => ({ id: v.id, sourceKind: v.sourceKind, brandSlug: v.brandSlug, partNo: v.partNo, isDefault: v.isDefault })),
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <span>Items</span><span>/</span><span className="text-foreground font-medium">Inventory</span>
        </div>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground mt-1">On-hand stock, valuation, and movements across every item — raw parts, sub-assemblies, finished goods, assets, and consumables.</p>
        </div>
      </div>

      {/* Stats */}
      <StatStrip items={[
        { label: "Inventory Value", value: formatINR(stats.value), desc: "On-hand valuation at lot cost", icon: Landmark, tone: "success" },
        { label: "Active SKUs", value: String(stats.skus), desc: "Items in the master", icon: Boxes, tone: "default" },
        { label: "Low Stock", value: String(stats.low), desc: "Below minimum level", icon: AlertTriangle, tone: "warning" },
        { label: "Out of Stock", value: String(stats.out), desc: "Nothing on hand", icon: ShieldAlert, tone: "danger" },
      ]} />

      <Card className="border border-border shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg font-bold">Physical Stock Ledger</CardTitle>
                <CardDescription>Every item that can hold stock — expand a row for lots, movements, and stock actions</CardDescription>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search code, P/N, name, category…" className="h-9 w-full pl-8 pr-8 sm:w-72" />
                {query && <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StockStatus | "All")}
                className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary">
                <option value="All">All statuses</option>
                <option value="Healthy">Healthy</option>
                <option value="Low">Low</option>
                <option value="Out of Stock">Out of Stock</option>
              </select>
            </div>
          </div>
          {/* Type chips */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {(["all", "raw", "semi_assembled", "assembled", "consumable", "asset", "packaging"] as const).map((t) => {
              const active = typeFilter === t
              const label = t === "all" ? "All types" : t === "semi_assembled" ? "Sub-assembly" : t === "assembled" ? "Finished" : t[0].toUpperCase() + t.slice(1)
              return (
                <button key={t} onClick={() => setTypeFilter(t)}
                  className={`px-2.5 py-1 text-xs rounded-full border font-semibold transition-all ${active ? "bg-primary/10 border-primary text-primary" : "bg-background border-border text-muted-foreground hover:bg-muted/50"}`}>
                  {label}
                </button>
              )
            })}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DragScrollArea className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] uppercase bg-muted/30 text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-6 py-3 font-semibold">Item</th>
                  <th className="px-4 py-3 font-semibold w-32">Type</th>
                  <th className="px-4 py-3 font-semibold">Generic PN</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-6 py-3 font-semibold w-52">On hand</th>
                  <th className="px-4 py-3 font-semibold text-right w-24">Reorder</th>
                  <th className="px-3 py-3 font-semibold text-center w-16">UOM</th>
                  <th className="px-6 py-3 font-semibold text-right w-32">Value</th>
                  <th className="px-4 py-3 font-semibold text-right w-28">Last move</th>
                  <th className="px-6 py-3 font-semibold text-right w-32">Status</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 11 }).map((__, j) => <td key={j} className="px-4 py-4"><Skeleton className="h-4 w-full" /></td>)}</tr>
                ))}
                {!loading && rows.map((it) => {
                  const status = stockStatus(it)
                  const style = STATUS_STYLE[status]
                  const pct = it.minStock > 0 ? Math.min(100, Math.round((it.onHand / it.minStock) * 100)) : (it.onHand > 0 ? 100 : 0)
                  const isOpen = expanded === it.id
                  const Icon = TYPE_ICON[it.itemType]
                  const bd = breakdown[it.id]
                  return (
                    <React.Fragment key={it.id}>
                      <tr className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => toggleRow(it.id)}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="h-4 w-4" /></div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-semibold leading-tight">{it.name}</span>
                              <span className="text-[11px] font-mono text-muted-foreground">{it.code}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border ${TYPE_META[it.itemType].tone}`}>
                            <Icon className="h-3 w-3" />{TYPE_META[it.itemType].label}
                          </span>
                        </td>
                        <td className="px-4 py-4 font-mono text-xs text-muted-foreground">{it.genericPn ?? "—"}</td>
                        <td className="px-4 py-4 text-xs text-muted-foreground">{it.categoryPath ?? "—"}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="font-mono font-bold">{it.onHand.toLocaleString()} <span className="text-muted-foreground font-normal">{it.baseUom}</span></span>
                            <span className="font-mono text-muted-foreground">min {it.minStock.toLocaleString()}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full ${style.bar}`} style={{ width: `${pct}%` }} /></div>
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-xs text-muted-foreground">{it.reorderQty > 0 ? it.reorderQty.toLocaleString() : "—"}</td>
                        <td className="px-3 py-4 text-center font-mono text-xs text-muted-foreground">{it.baseUom}</td>
                        <td className="px-6 py-4 text-right font-mono font-semibold">{it.stockValue > 0 ? formatINR(it.stockValue) : "—"}</td>
                        <td className="px-4 py-4 text-right text-xs text-muted-foreground whitespace-nowrap" title={it.lastMovementAt ? new Date(it.lastMovementAt).toLocaleString() : "No movements yet"}>{timeAgo(it.lastMovementAt)}</td>
                        <td className="px-6 py-4 text-right">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${style.pill}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />{status}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center"><ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} /></td>
                      </tr>

                      {isOpen && (
                        <tr className="bg-muted/10">
                          <td colSpan={11} className="px-6 py-5">
                            {/* Action bar */}
                            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
                              <div className="flex items-center gap-2 text-sm">
                                <Boxes className="h-4 w-4 text-primary" />
                                <span className="font-semibold">Stock actions</span>
                                <span className="text-muted-foreground">— record a movement for {it.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button size="sm" className="h-8 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                                  disabled={it.variants.length === 0}
                                  onClick={(e) => { e.stopPropagation(); setMove({ item: toMoveItem(it), mode: "in" }) }}>
                                  <ArrowDownToLine className="h-3.5 w-3.5" /> Stock In
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 gap-1.5 border-amber-500/40 text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                                  disabled={it.variants.length === 0 || it.onHand <= 0}
                                  onClick={(e) => { e.stopPropagation(); setMove({ item: toMoveItem(it), mode: "out" }) }}>
                                  <ArrowUpFromLine className="h-3.5 w-3.5" /> Stock Out
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 text-xs font-semibold"
                                  render={<Link href={`/items/details/${encodeURIComponent(it.id)}?from=inventory`} />}>
                                  Full record <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
                                </Button>
                              </div>
                            </div>

                            {bd === "loading" || !bd ? (
                              <div className="grid gap-4 md:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
                            ) : (
                              <div className="grid gap-6 lg:grid-cols-3">
                                {/* By warehouse */}
                                <div className="space-y-2">
                                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Boxes className="h-3.5 w-3.5" /> Stock by warehouse</h4>
                                  <div className="rounded-lg border border-border bg-background divide-y divide-border text-xs">
                                    {bd.stock.byWarehouse.length === 0 && <div className="px-3 py-2 text-muted-foreground italic">No stock</div>}
                                    {bd.stock.byWarehouse.map((w) => (
                                      <div key={w.warehouseId} className="flex items-center justify-between px-3 py-2"><span className="font-semibold">{w.code}</span><span className="font-mono">{w.onHand.toLocaleString()}</span></div>
                                    ))}
                                  </div>
                                </div>
                                {/* Lots */}
                                <div className="space-y-2">
                                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Lots (FEFO)</h4>
                                  <div className="rounded-lg border border-border bg-background divide-y divide-border text-xs max-h-48 overflow-y-auto">
                                    {bd.stock.byLot.length === 0 && <div className="px-3 py-2 text-muted-foreground italic">No lots</div>}
                                    {bd.stock.byLot.map((l, i) => (
                                      <div key={i} className="px-3 py-2 space-y-0.5">
                                        <div className="flex items-center justify-between"><span className="font-mono font-semibold truncate">{l.lotNo}</span><span className="font-mono">{l.onHand.toLocaleString()}</span></div>
                                        <div className="text-[10px] text-muted-foreground flex items-center justify-between gap-2">
                                          <span className="truncate">{[l.brandSlug, l.supplierName].filter(Boolean).join(" · ") || "—"}</span>
                                          <span>{l.receivedDate ?? "—"}{l.expiryDate ? ` → ${l.expiryDate}` : ""}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                {/* History */}
                                <div className="space-y-2">
                                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Movement history</h4>
                                  <div className="rounded-lg border border-border bg-background divide-y divide-border text-xs max-h-48 overflow-y-auto">
                                    {bd.ledger.length === 0 && <div className="px-3 py-2 text-muted-foreground italic">No movements</div>}
                                    {bd.ledger.map((m) => (
                                      <div key={m.id} className="px-3 py-2 flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                          <span className={`font-bold ${m.qtyDelta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{m.type}</span>
                                          <span className="text-muted-foreground ml-1.5">{m.warehouseCode ?? ""}{m.locationCode ? `·${m.locationCode}` : ""}</span>
                                          {m.lotNo && <div className="text-[10px] font-mono text-muted-foreground truncate">{m.lotNo}{m.supplierName ? ` · ${m.supplierName}` : ""}</div>}
                                        </div>
                                        <div className="text-right shrink-0">
                                          <span className={`font-mono font-semibold ${m.qtyDelta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{m.qtyDelta > 0 ? "+" : ""}{m.qtyDelta.toLocaleString()}</span>
                                          <div className="text-[10px] text-muted-foreground">{new Date(m.createdAt).toLocaleDateString()}</div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={11} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Search className="h-8 w-8 opacity-30" />
                      <span className="text-sm font-medium">{error ? "Failed to load inventory" : "No items match your search"}</span>
                      {error && <span className="text-xs font-mono">{error}</span>}
                      {!error && <Button variant="outline" size="sm" className="mt-2" onClick={() => { setQuery(""); setTypeFilter("all"); setStatusFilter("All") }}>Reset filters</Button>}
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </DragScrollArea>
          {!loading && rows.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-border bg-muted/20 px-6 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>Showing <strong className="text-foreground font-mono">{rows.length}</strong> of <strong className="text-foreground font-mono">{items.length}</strong> items</span>
              <span>Filtered value: <strong className="text-foreground font-mono">{formatINR(rows.reduce((s, i) => s + i.stockValue, 0))}</strong></span>
            </div>
          )}
        </CardContent>
      </Card>

      {move && (
        <ItemStockMoveDialog
          mode={move.mode}
          item={move.item}
          onClose={() => setMove(null)}
          onDone={(msg) => { setMove(null); showToast(msg); void load(); if (expanded) void loadBreakdown(expanded) }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />{toast}
        </div>
      )}
    </div>
  )
}
