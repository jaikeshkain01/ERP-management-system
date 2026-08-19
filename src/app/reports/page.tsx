"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import {
  BarChart3, TrendingUp, Clock, Percent, DollarSign, Boxes,
  ShieldAlert, Truck, Tag, Layers, ArrowUpRight, CheckCircle2,
  AlertTriangle, RefreshCw, Landmark, Filter, Check,
} from "lucide-react"
import { StatStrip } from "@/components/stat-strip"
import { DragScrollArea } from "@/components/ui/drag-scroll-area"
import { useData } from "@/lib/data-provider"
import type { MonthlyYield, ReportsSummary } from "@/lib/server/data/production"

const chartConfig = {
  yield: {
    label: "Yield Units",
    color: "hsl(var(--primary))",
  },
}

type TabKey = "overview" | "inventory" | "suppliers" | "production"

const formatINR = (n: number, decimals = 0) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: decimals })

export default function ReportsPage() {
  const d = useData()
  const [mounted, setMounted] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<TabKey>("overview")
  const [timeRange, setTimeRange] = React.useState<string>("6m")
  const [productionData, setProductionData] = React.useState<MonthlyYield[]>([])
  const [summary, setSummary] = React.useState<ReportsSummary | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [toast, setToast] = React.useState<string | null>(null)

  const loadBackendReports = React.useCallback(async () => {
    setLoading(true)
    try {
      const [yieldRes, summaryRes] = await Promise.all([
        fetch(`/api/reports/yield?range=${timeRange}`, { cache: "no-store" }),
        fetch("/api/reports/summary", { cache: "no-store" }),
      ])
      const yieldBody = await yieldRes.json().catch(() => null)
      if (yieldRes.ok && Array.isArray(yieldBody?.data)) setProductionData(yieldBody.data)
      const summaryBody = await summaryRes.json().catch(() => null)
      if (summaryRes.ok && summaryBody?.data) setSummary(summaryBody.data as ReportsSummary)
    } finally {
      setLoading(false)
    }
  }, [timeRange])

  React.useEffect(() => {
    setMounted(true)
    loadBackendReports()
  }, [loadBackendReports])

  const triggerToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  // ── Real Data Derived Analytics ─────────────────────────────────────────

  // 1. Inventory & Valuation Analytics
  const totalValuation = React.useMemo(() => {
    return d.COMPONENTS.reduce((sum, c) => sum + c.stock * d.bestPrice(c), 0)
  }, [d])

  const categoryValuations = React.useMemo(() => {
    const map = new Map<string, { category: string; count: number; stock: number; value: number }>()
    for (const c of d.COMPONENTS) {
      const cat = c.category || "Uncategorized"
      const val = c.stock * d.bestPrice(c)
      const existing = map.get(cat) ?? { category: cat, count: 0, stock: 0, value: 0 }
      map.set(cat, {
        category: cat,
        count: existing.count + 1,
        stock: existing.stock + c.stock,
        value: existing.value + val,
      })
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value)
  }, [d])

  const topValuableSKUs = React.useMemo(() => {
    return d.COMPONENTS
      .map((c) => ({
        id: c.id,
        name: c.name,
        genericPN: c.genericPN,
        category: c.category,
        stock: c.stock,
        unitCost: d.bestPrice(c),
        value: c.stock * d.bestPrice(c),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
  }, [d])

  const stockHealthMetrics = React.useMemo(() => {
    let healthyCount = 0, lowCount = 0, criticalCount = 0, outOfStockCount = 0
    let healthyVal = 0, lowVal = 0, criticalVal = 0, outVal = 0

    for (const c of d.COMPONENTS) {
      const val = c.stock * d.bestPrice(c)
      if (c.stock === 0) {
        outOfStockCount++
        outVal += val
      } else if (c.stock <= c.minStock * 0.5) {
        criticalCount++
        criticalVal += val
      } else if (c.stock < c.minStock) {
        lowCount++
        lowVal += val
      } else {
        healthyCount++
        healthyVal += val
      }
    }
    return {
      healthy: { count: healthyCount, value: healthyVal },
      low: { count: lowCount, value: lowVal },
      critical: { count: criticalCount, value: criticalVal },
      outOfStock: { count: outOfStockCount, value: outVal },
      totalSKUs: d.COMPONENTS.length,
    }
  }, [d])

  // 2. Supplier & Procurement Risk Analytics
  const singleSupplierSKUs = React.useMemo(() => {
    return d.COMPONENTS.filter((c) => d.isSingleSupplier(c)).map((c) => ({
      id: c.id,
      name: c.name,
      genericPN: c.genericPN,
      category: c.category,
      supplierName: c.offers[0] ? d.getSupplierName(c.offers[0].supplierId) : "—",
      brandName: c.offers[0] ? d.getBrandName(c.offers[0].brandId) : "—",
      unitCost: d.bestPrice(c),
    }))
  }, [d])

  const supplierPerformanceMatrix = React.useMemo(() => {
    return d.SUPPLIERS.map((s) => {
      const offers = d.COMPONENTS.flatMap((c) => c.offers.filter((o) => o.supplierId === s.id))
      const uniqueBrands = new Set(offers.map((o) => o.brandId)).size
      const avgLeadTime = offers.length
        ? Math.round(offers.reduce((acc, o) => acc + o.leadTimeDays, 0) / offers.length)
        : 0
      return {
        id: s.id,
        name: s.name,
        contact: s.contact,
        rating: s.rating,
        offersCount: offers.length,
        brandsCount: uniqueBrands,
        avgLeadTime,
      }
    }).sort((a, b) => b.offersCount - a.offersCount)
  }, [d])

  // Top KPI Strips
  const stats = [
    {
      title: "Inventory Asset Valuation",
      value: formatINR(totalValuation),
      description: `Across ${d.COMPONENTS.length} catalog SKUs`,
      icon: Landmark,
      accent: "text-emerald-600 bg-emerald-500/10",
    },
    {
      title: "Units Produced",
      value: (summary?.unitsProduced ?? 0).toLocaleString(),
      description: `${summary?.totalBatches ?? 0} batches completed`,
      icon: BarChart3,
      accent: "text-primary bg-primary/10",
    },
    {
      title: "Manufacturing Yield Rate",
      value: `${(summary?.avgYield ?? 0).toFixed(1)}%`,
      description: "Batch completion ratio",
      icon: Percent,
      accent: "text-indigo-600 bg-indigo-500/10",
    },
    {
      title: "Supplier Sourcing Risk",
      value: `${singleSupplierSKUs.length} SKUs`,
      description: "Single-supplier dependencies",
      icon: ShieldAlert,
      accent: "text-amber-500 bg-amber-500/10",
    },
  ]

  const distribution = summary?.distribution ?? []
  const distTotal = distribution.reduce((s, r) => s + r.units, 0)

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-[70] flex items-center gap-2 rounded-xl border border-emerald-500/35 bg-background px-4 py-3 text-sm font-semibold text-emerald-600 dark:text-emerald-400 shadow-lg animate-in fade-in slide-in-from-bottom-5 duration-300">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <span>Reports</span>
            <span>/</span>
            <span className="text-foreground font-medium">Performance Analytics</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Reports & Analytics</h1>
          <p className="text-muted-foreground">
            Comprehensive real-time intelligence on inventory valuation, production velocity, and supplier risk.
          </p>
        </div>

        {/* Time Range Selector & Refresh */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 text-xs">
            <span className="px-2 text-muted-foreground font-medium flex items-center gap-1">
              <Filter className="h-3 w-3" /> Timeframe:
            </span>
            {(["30d", "3m", "6m", "1y"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`rounded-md px-2.5 py-1 font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                  timeRange === r
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadBackendReports}
            disabled={loading}
            className="h-9 gap-1.5 font-semibold cursor-pointer border-border bg-background"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* High-Impact Instrument Readout Strip */}
      <StatStrip
        items={stats.map((stat) => ({
          label: stat.title,
          value: stat.value,
          desc: stat.description,
          icon: stat.icon,
        }))}
      />

      {/* Main Navigation Tabs */}
      <div className="flex border-b border-border gap-2 text-sm font-semibold">
        {[
          { key: "overview", label: "Executive Overview", icon: BarChart3 },
          { key: "inventory", label: "Inventory & Valuation", icon: Landmark },
          { key: "suppliers", label: "Procurement & Suppliers", icon: Truck },
          { key: "production", label: "Production Velocity", icon: TrendingUp },
        ].map((t) => {
          const TIcon = t.icon
          const active = activeTab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as TabKey)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 transition-colors cursor-pointer ${
                active
                  ? "border-primary text-primary font-bold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <TIcon className="h-4 w-4" />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* TAB 1: EXECUTIVE OVERVIEW */}
      {activeTab === "overview" && (
        <div className="grid gap-6 md:grid-cols-3 animate-in fade-in duration-300">
          {/* Main Production Yield Chart */}
          <Card className="md:col-span-2 border border-border shadow-sm">
            <CardHeader className="border-b border-border bg-muted/20">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold">Monthly Finished Yield Output</CardTitle>
                  <CardDescription>Finished product volume output over time</CardDescription>
                </div>
                <span className="text-xs font-mono font-bold bg-primary/10 text-primary px-2.5 py-1 rounded-full">
                  Range: {timeRange.toUpperCase()}
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="h-[320px] w-full">
                {mounted ? (
                  <ChartContainer config={chartConfig} className="h-[320px] w-full">
                    <BarChart data={productionData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} className="text-xs text-muted-foreground" />
                      <YAxis tickLine={false} axisLine={false} className="text-xs text-muted-foreground" />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="yield" fill="var(--color-yield)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
                    Loading analytics chart...
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Product Distribution */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="border-b border-border bg-muted/20">
              <CardTitle className="text-lg font-bold">Product Line Output</CardTitle>
              <CardDescription>Finished batch breakdown by product line</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-4">
                {distribution.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No completed production orders recorded yet.
                  </p>
                ) : (
                  distribution.map((row, idx) => {
                    const pct = distTotal > 0 ? Math.round((row.units / distTotal) * 100) : 0
                    return (
                      <div key={idx} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-semibold text-foreground">{row.product}</span>
                          <span className="font-mono text-muted-foreground">{pct}% ({row.units.toLocaleString()} Units)</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                          <div
                            className={idx === 0 ? "bg-primary h-2 rounded-full" : "bg-primary/60 h-2 rounded-full"}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>

          {/* Category Valuation Summary */}
          <Card className="md:col-span-3 border border-border shadow-sm">
            <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
              <CardTitle className="text-lg font-bold">Asset Valuation by Item Category</CardTitle>
              <CardDescription>Total raw material capital holding distribution across categories</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {categoryValuations.map((cat) => {
                  const pct = totalValuation > 0 ? Math.round((cat.value / totalValuation) * 100) : 0
                  return (
                    <div key={cat.category} className="border border-border/80 rounded-xl p-4 bg-card space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
                        <span>{cat.category}</span>
                        <span className="font-mono">{pct}%</span>
                      </div>
                      <div className="text-lg font-extrabold font-mono text-foreground">{formatINR(cat.value)}</div>
                      <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
                        <span>{cat.count} SKUs</span>
                        <span>{cat.stock.toLocaleString()} Units</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div className="bg-primary h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: INVENTORY & VALUATION */}
      {activeTab === "inventory" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Health Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="border border-emerald-500/20 bg-emerald-500/5 rounded-xl p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block">Healthy Stock</span>
              <div className="text-2xl font-black font-mono mt-1 text-foreground">{stockHealthMetrics.healthy.count} SKUs</div>
              <span className="text-xs font-mono text-muted-foreground mt-1 block">Valuation: {formatINR(stockHealthMetrics.healthy.value)}</span>
            </div>
            <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block">Low Stock</span>
              <div className="text-2xl font-black font-mono mt-1 text-foreground">{stockHealthMetrics.low.count} SKUs</div>
              <span className="text-xs font-mono text-muted-foreground mt-1 block">Valuation: {formatINR(stockHealthMetrics.low.value)}</span>
            </div>
            <div className="border border-orange-500/20 bg-orange-500/5 rounded-xl p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400 block">Critical Level</span>
              <div className="text-2xl font-black font-mono mt-1 text-foreground">{stockHealthMetrics.critical.count} SKUs</div>
              <span className="text-xs font-mono text-muted-foreground mt-1 block">Valuation: {formatINR(stockHealthMetrics.critical.value)}</span>
            </div>
            <div className="border border-destructive/20 bg-destructive/5 rounded-xl p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-destructive block">Out of Stock</span>
              <div className="text-2xl font-black font-mono mt-1 text-destructive">{stockHealthMetrics.outOfStock.count} SKUs</div>
              <span className="text-xs font-mono text-muted-foreground mt-1 block">Depleted stock items</span>
            </div>
          </div>

          {/* Top 5 Most Valuable SKUs */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
              <CardTitle className="text-lg font-bold">Top 5 Most Valuable Inventory SKUs</CardTitle>
              <CardDescription>Highest capital-holding item inventory items on hand</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <DragScrollArea className="overflow-x-auto">
                <table className="w-full text-sm text-left text-foreground">
                  <thead className="bg-muted uppercase text-xs text-muted-foreground border-b border-border font-semibold">
                    <tr>
                      <th className="px-6 py-3">Rank</th>
                      <th className="px-6 py-3">Item</th>
                      <th className="px-6 py-3">Category</th>
                      <th className="px-6 py-3 text-right">Unit Cost</th>
                      <th className="px-6 py-3 text-right">Stock On-Hand</th>
                      <th className="px-6 py-3 text-right">Total Asset Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {topValuableSKUs.map((sku, idx) => (
                      <tr key={sku.id} className="hover:bg-muted/10 font-medium">
                        <td className="px-6 py-4 font-mono font-bold text-muted-foreground">#{idx + 1}</td>
                        <td className="px-6 py-4">
                          <span className="font-semibold block">{sku.name}</span>
                          <span className="text-xs font-mono text-muted-foreground">{sku.genericPN}</span>
                        </td>
                        <td className="px-6 py-4 text-xs">{sku.category}</td>
                        <td className="px-6 py-4 text-right font-mono">{formatINR(sku.unitCost, 2)}</td>
                        <td className="px-6 py-4 text-right font-mono font-bold">{sku.stock.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right font-mono text-emerald-600 dark:text-emerald-400 font-extrabold text-base">
                          {formatINR(sku.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DragScrollArea>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: PROCUREMENT & SUPPLIERS */}
      {activeTab === "suppliers" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Single-Supplier Sourcing Risk */}
          <Card className="border border-amber-500/30 bg-amber-500/5 shadow-sm">
            <CardHeader className="border-b border-amber-500/20 px-6 py-4">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-5 w-5" />
                <CardTitle className="text-lg font-bold">Single-Supplier Sourcing Dependencies ({singleSupplierSKUs.length})</CardTitle>
              </div>
              <CardDescription className="text-amber-600/80 dark:text-amber-400/80">
                Items reliant on a single distributor channel — high procurement vulnerability risk.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <DragScrollArea className="overflow-x-auto">
                <table className="w-full text-xs text-left text-foreground">
                  <thead className="bg-amber-500/10 uppercase text-[10px] text-amber-700 dark:text-amber-300 border-b border-amber-500/20 font-semibold">
                    <tr>
                      <th className="px-6 py-2.5">Item</th>
                      <th className="px-6 py-2.5">Generic P/N</th>
                      <th className="px-6 py-2.5">Exclusive Supplier</th>
                      <th className="px-6 py-2.5">Manufacturer</th>
                      <th className="px-6 py-2.5 text-right">Unit Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-500/10 font-medium">
                    {singleSupplierSKUs.map((sku) => (
                      <tr key={sku.id} className="hover:bg-amber-500/5">
                        <td className="px-6 py-3 font-semibold">{sku.name}</td>
                        <td className="px-6 py-3 font-mono text-muted-foreground">{sku.genericPN}</td>
                        <td className="px-6 py-3 font-semibold">{sku.supplierName}</td>
                        <td className="px-6 py-3 font-mono">{sku.brandName}</td>
                        <td className="px-6 py-3 text-right font-mono font-bold text-primary">{formatINR(sku.unitCost, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DragScrollArea>
            </CardContent>
          </Card>

          {/* Supplier Matrix */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
              <CardTitle className="text-lg font-bold">Supplier Performance & Offer Matrix</CardTitle>
              <CardDescription>Registered distributor channels, manufacturer coverage, and average delivery lead times</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <DragScrollArea className="overflow-x-auto">
                <table className="w-full text-sm text-left text-foreground">
                  <thead className="bg-muted uppercase text-xs text-muted-foreground border-b border-border font-semibold">
                    <tr>
                      <th className="px-6 py-3">Supplier Name</th>
                      <th className="px-6 py-3">Contact</th>
                      <th className="px-6 py-3 text-center">Catalog Offers</th>
                      <th className="px-6 py-3 text-center">Manufacturers Covered</th>
                      <th className="px-6 py-3 text-right">Avg Lead Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {supplierPerformanceMatrix.map((s) => (
                      <tr key={s.id} className="hover:bg-muted/10 font-medium">
                        <td className="px-6 py-4 font-semibold">{s.name}</td>
                        <td className="px-6 py-4 text-xs text-muted-foreground">{s.contact || "—"}</td>
                        <td className="px-6 py-4 text-center font-mono font-bold">{s.offersCount}</td>
                        <td className="px-6 py-4 text-center font-mono">{s.brandsCount}</td>
                        <td className="px-6 py-4 text-right font-mono text-primary font-bold">{s.avgLeadTime} Days</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DragScrollArea>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: PRODUCTION VELOCITY */}
      {activeTab === "production" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border border-border shadow-sm">
              <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
                <CardTitle className="text-lg font-bold">Historical Monthly Yield Table</CardTitle>
                <CardDescription>Monthly finished batch output units</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm text-left text-foreground">
                  <thead className="bg-muted uppercase text-xs text-muted-foreground border-b border-border font-semibold">
                    <tr>
                      <th className="px-6 py-3">Month</th>
                      <th className="px-6 py-3 text-right">Finished Yield Output</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {productionData.map((row) => (
                      <tr key={row.month} className="hover:bg-muted/10 font-medium">
                        <td className="px-6 py-3.5 font-bold">{row.month}</td>
                        <td className="px-6 py-3.5 text-right font-mono text-primary font-extrabold text-base">
                          {row.yield.toLocaleString()} Units
                        </td>
                      </tr>
                    ))}
                    {productionData.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-6 py-6 text-center text-muted-foreground text-xs">
                          No production yield history logged yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card className="border border-border shadow-sm">
              <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
                <CardTitle className="text-lg font-bold">Manufacturing Key Metrics</CardTitle>
                <CardDescription>Velocity and order completion performance</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-4 text-sm">
                <div className="flex justify-between border-b border-border pb-3">
                  <span className="text-muted-foreground">Total Completed Batches</span>
                  <span className="font-mono font-bold text-foreground">{(summary?.totalBatches ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-b border-border pb-3">
                  <span className="text-muted-foreground">Total Volume Output</span>
                  <span className="font-mono font-bold text-foreground">{(summary?.unitsProduced ?? 0).toLocaleString()} Units</span>
                </div>
                <div className="flex justify-between border-b border-border pb-3">
                  <span className="text-muted-foreground">Order Completion Rate</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{(summary?.avgYield ?? 0).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between pb-1">
                  <span className="text-muted-foreground">Average Batch Lead Time</span>
                  <span className="font-mono font-bold text-primary">{(summary?.avgLeadTimeDays ?? 0).toFixed(1)} Days</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
