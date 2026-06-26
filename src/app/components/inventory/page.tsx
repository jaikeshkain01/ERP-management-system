"use client"

import * as React from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertCircle, AlertTriangle, ChevronDown, DollarSign,
  Landmark, Layers, MapPin, Nut, Package, Search, ShieldAlert, X,
  Boxes, ArrowUpRight, Truck, Tag,
} from "lucide-react"
import {
  COMPONENTS, getBrandName, getSupplierName, bestPrice,
  productsUsingComponent, formatINR as mINR, formatLeadTime,
} from "@/mockdata"

// --- Types ---
type StockStatus = "Healthy" | "Low" | "Critical" | "Out of Stock"

interface BrandVariant {
  brand: string
  partNo: string
  stock: number
}

interface SupplierOffer {
  supplier: string
  brand: string
  price: string
  leadTime: string
}

interface InventoryItem {
  id: string
  name: string
  genericPN: string
  category: string
  stock: number
  minStock: number
  reorderQty: number
  unit: string
  unitCost: number
  bin: string
  solderType: "SMD" | "DIP"
  footprint: string
  lastCount: string
  brands: BrandVariant[]
  suppliers: SupplierOffer[]
  usedIn: string[]
}

// --- Inventory view model derived from the centralized component store ---
const INVENTORY: InventoryItem[] = COMPONENTS.map((c) => ({
  id: c.id,
  name: c.name,
  genericPN: c.genericPN,
  category: c.category,
  stock: c.stock,
  minStock: c.minStock,
  reorderQty: c.reorderQty,
  unit: c.unit,
  unitCost: bestPrice(c),
  bin: c.bin,
  solderType: c.solderType,
  footprint: c.footprint,
  lastCount: c.lastCount,
  brands: c.brandVariants.map((v) => ({ brand: getBrandName(v.brandId), partNo: v.partNo, stock: v.stock })),
  suppliers: c.offers.map((o) => ({
    supplier: getSupplierName(o.supplierId),
    brand: getBrandName(o.brandId),
    price: mINR(o.price),
    leadTime: formatLeadTime(o.leadTimeDays),
  })),
  usedIn: productsUsingComponent(c.id).map((p) => p.name),
}))

const CATEGORIES = ["All", ...Array.from(new Set(INVENTORY.map((i) => i.category)))]

// --- Helpers ---
function getStatus(item: InventoryItem): StockStatus {
  if (item.stock === 0) return "Out of Stock"
  if (item.stock < item.minStock * 0.5) return "Critical"
  if (item.stock < item.minStock) return "Low"
  return "Healthy"
}

const STATUS_STYLES: Record<StockStatus, { pill: string; bar: string; dot: string }> = {
  Healthy: {
    pill: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500", dot: "bg-emerald-500",
  },
  Low: {
    pill: "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500", dot: "bg-amber-500",
  },
  Critical: {
    pill: "bg-orange-500/10 border-orange-500/20 text-orange-600 dark:text-orange-400",
    bar: "bg-orange-500", dot: "bg-orange-500",
  },
  "Out of Stock": {
    pill: "bg-destructive/10 border-destructive/20 text-destructive",
    bar: "bg-destructive", dot: "bg-destructive",
  },
}

const formatINR = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 })

export default function InventoryPage() {
  const [draftQuery, setDraftQuery] = React.useState("")
  const [query, setQuery] = React.useState("")
  const [category, setCategory] = React.useState("All")
  const [statusFilter, setStatusFilter] = React.useState<StockStatus | "All">("All")
  const [expanded, setExpanded] = React.useState<string | null>(null)

  const submitSearch = () => setQuery(draftQuery.trim())
  const clearSearch = () => {
    setDraftQuery("")
    setQuery("")
  }

  // --- Derived stats (over the whole dataset, not filtered) ---
  const stats = React.useMemo(() => {
    const totalValue = INVENTORY.reduce((sum, i) => sum + i.stock * i.unitCost, 0)
    const counts = INVENTORY.reduce(
      (acc, i) => {
        acc[getStatus(i)]++
        return acc
      },
      { Healthy: 0, Low: 0, Critical: 0, "Out of Stock": 0 } as Record<StockStatus, number>
    )
    return { totalValue, counts, skuCount: INVENTORY.length }
  }, [])

  // --- Filtered rows ---
  const rows = React.useMemo(() => {
    const q = query.toLowerCase()
    return INVENTORY.filter((item) => {
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.genericPN.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.bin.toLowerCase().includes(q) ||
        item.brands.some((b) => b.brand.toLowerCase().includes(q) || b.partNo.toLowerCase().includes(q))
      const matchesCategory = category === "All" || item.category === category
      const matchesStatus = statusFilter === "All" || getStatus(item) === statusFilter
      return matchesQuery && matchesCategory && matchesStatus
    })
  }, [query, category, statusFilter])

  const summaryCards = [
    {
      title: "Inventory Value", value: formatINR(stats.totalValue), desc: "On-hand valuation at unit cost",
      icon: Landmark, accent: "text-emerald-600 bg-emerald-500/10", border: "border-border",
    },
    {
      title: "Active SKUs", value: String(stats.skuCount), desc: "Distinct catalog line items",
      icon: Boxes, accent: "text-primary bg-primary/10", border: "border-border",
    },
    {
      title: "Low / Critical", value: String(stats.counts.Low + stats.counts.Critical), desc: "Below safety stock level",
      icon: AlertTriangle, accent: "text-amber-500 bg-amber-500/10",
      border: "border-amber-500/20 bg-amber-500/[0.03]",
    },
    {
      title: "Out of Stock", value: String(stats.counts["Out of Stock"]), desc: "Depleted, blocks production",
      icon: ShieldAlert, accent: "text-destructive bg-destructive/10",
      border: "border-destructive/20 bg-destructive/[0.03]",
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <span>Components</span>
          <span>/</span>
          <span className="text-foreground font-medium">Inventory</span>
        </div>
        <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Inventory</h1>
            <p className="text-muted-foreground mt-1">
              Stock levels, valuation, bin allocation, and supplier coverage across the component catalog.
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((c) => {
          const Icon = c.icon
          return (
            <Card key={c.title} className={`relative overflow-hidden transition-all duration-300 hover:shadow-md ${c.border}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{c.title}</CardTitle>
                <div className={`h-8 w-8 flex items-center justify-center rounded-lg ${c.accent}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-black tracking-tight">{c.value}</div>
                <p className="text-[11px] text-muted-foreground mt-1">{c.desc}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Ledger */}
      <Card className="border border-border shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg font-bold">Physical Stock Ledger</CardTitle>
                <CardDescription>On-hand quantities, valuation, and warehouse allocation</CardDescription>
              </div>
            </div>

            {/* Search + filters */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={draftQuery}
                  onChange={(e) => setDraftQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitSearch()}
                  placeholder="Search part, P/N, brand, bin…"
                  className="h-9 w-full pl-8 pr-8 sm:w-72"
                />
                {draftQuery && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Button size="sm" onClick={submitSearch} className="h-9 font-semibold cursor-pointer">
                <Search className="h-3.5 w-3.5 mr-1.5" />
                Search
              </Button>
            </div>
          </div>

          {/* Category + status filter chips */}
          <div className="flex flex-wrap items-center gap-1.5 pt-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">Category</span>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors cursor-pointer ${
                  category === cat
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-transparent text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {cat}
              </button>
            ))}
            <div className="mx-2 h-4 w-px bg-border" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">Status</span>
            {(["All", "Healthy", "Low", "Critical", "Out of Stock"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors cursor-pointer ${
                  statusFilter === st
                    ? "border-foreground/20 bg-foreground/5 text-foreground"
                    : "border-border bg-transparent text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-foreground">
              <thead className="text-[11px] uppercase bg-muted/40 text-muted-foreground border-b border-border tracking-wide">
                <tr>
                  <th className="px-6 py-3 font-semibold">Component</th>
                  <th className="px-6 py-3 font-semibold">Category</th>
                  <th className="px-6 py-3 font-semibold w-[200px]">Stock Level</th>
                  <th className="px-6 py-3 font-semibold text-right">Value</th>
                  <th className="px-6 py-3 font-semibold">Location</th>
                  <th className="px-6 py-3 font-semibold text-right">Status</th>
                  <th className="px-4 py-3 font-semibold text-center w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((item) => {
                  const status = getStatus(item)
                  const style = STATUS_STYLES[status]
                  const pct = Math.min(100, Math.round((item.stock / Math.max(item.minStock, 1)) * 100))
                  const isOpen = expanded === item.id
                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        className="hover:bg-muted/20 transition-colors cursor-pointer"
                        onClick={() => setExpanded(isOpen ? null : item.id)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-muted text-muted-foreground">
                              <Nut className="h-4 w-4" />
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="font-semibold leading-tight">{item.name}</span>
                              <span className="text-[11px] font-mono text-muted-foreground">{item.genericPN}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <Tag className="h-3 w-3" />
                            {item.category}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="font-mono font-bold text-foreground">{item.stock.toLocaleString()}</span>
                            <span className="font-mono text-muted-foreground">min {item.minStock.toLocaleString()}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${pct}%` }} />
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-semibold">
                          {formatINR(item.stock * item.unitCost)}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                            {item.bin}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${style.pill}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                            {status}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </td>
                      </tr>

                      {/* Expanded detail */}
                      {isOpen && (
                        <tr className="bg-muted/10">
                          <td colSpan={7} className="px-6 py-5">
                            <div className="grid gap-6 lg:grid-cols-3">
                              {/* Specs / meta */}
                              <div className="space-y-3">
                                <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                  <Layers className="h-3.5 w-3.5" /> Specifications
                                </h4>
                                <dl className="space-y-1.5 text-xs">
                                  {[
                                    ["Solder Type", item.solderType],
                                    ["Footprint", item.footprint],
                                    ["Unit Cost", `₹${item.unitCost.toFixed(2)}`],
                                    ["Reorder Qty", `${item.reorderQty.toLocaleString()} ${item.unit}`],
                                    ["Last Counted", item.lastCount],
                                  ].map(([k, v]) => (
                                    <div key={k} className="flex justify-between gap-4 border-b border-border/50 pb-1.5">
                                      <dt className="text-muted-foreground">{k}</dt>
                                      <dd className="font-medium font-mono text-right">{v}</dd>
                                    </div>
                                  ))}
                                </dl>
                                <div className="pt-1">
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Used In</span>
                                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                                    {item.usedIn.map((p) => (
                                      <span key={p} className="rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-medium">
                                        {p}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {/* Brand variants */}
                              <div className="space-y-3">
                                <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                  <Tag className="h-3.5 w-3.5" /> Brand Variants
                                </h4>
                                <div className="rounded-lg border border-border overflow-hidden bg-background">
                                  <table className="w-full text-xs">
                                    <thead className="bg-muted/40 text-muted-foreground">
                                      <tr>
                                        <th className="px-3 py-2 text-left font-semibold">Brand</th>
                                        <th className="px-3 py-2 text-left font-semibold">Part No.</th>
                                        <th className="px-3 py-2 text-right font-semibold">Stock</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                      {item.brands.map((b) => (
                                        <tr key={b.partNo}>
                                          <td className="px-3 py-2 font-semibold">{b.brand}</td>
                                          <td className="px-3 py-2 font-mono text-muted-foreground">{b.partNo}</td>
                                          <td className="px-3 py-2 text-right font-mono">{b.stock.toLocaleString()}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              {/* Suppliers */}
                              <div className="space-y-3">
                                <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                  <Truck className="h-3.5 w-3.5" /> Supplier Coverage
                                </h4>
                                <div className="rounded-lg border border-border overflow-hidden bg-background">
                                  <table className="w-full text-xs">
                                    <thead className="bg-muted/40 text-muted-foreground">
                                      <tr>
                                        <th className="px-3 py-2 text-left font-semibold">Supplier</th>
                                        <th className="px-3 py-2 text-right font-semibold">Price</th>
                                        <th className="px-3 py-2 text-right font-semibold">Lead</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                      {item.suppliers.map((s) => (
                                        <tr key={s.supplier}>
                                          <td className="px-3 py-2">
                                            <span className="font-semibold block">{s.supplier}</span>
                                            <span className="text-muted-foreground">{s.brand}</span>
                                          </td>
                                          <td className="px-3 py-2 text-right font-mono font-semibold text-primary">{s.price}</td>
                                          <td className="px-3 py-2 text-right font-mono text-muted-foreground">{s.leadTime}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                {item.suppliers.length === 1 && (
                                  <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    Single supplier — sourcing risk
                                  </div>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs font-semibold w-full cursor-pointer"
                                  render={<Link href="/components/details" />}
                                >
                                  View full component record
                                  <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}

                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Search className="h-8 w-8 opacity-30" />
                        <span className="text-sm font-medium">No components match your search</span>
                        <span className="text-xs">Try a different term or reset the filters</span>
                        <Button variant="outline" size="sm" className="mt-2 cursor-pointer" onClick={() => { clearSearch(); setCategory("All"); setStatusFilter("All") }}>
                          Reset filters
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer summary */}
          {rows.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-border bg-muted/20 px-6 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>
                Showing <strong className="text-foreground font-mono">{rows.length}</strong> of{" "}
                <strong className="text-foreground font-mono">{INVENTORY.length}</strong> components
              </span>
              <span className="flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                Filtered value:{" "}
                <strong className="text-foreground font-mono">
                  {formatINR(rows.reduce((s, i) => s + i.stock * i.unitCost, 0))}
                </strong>
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
