"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Package, Cpu, Nut, Truck, Award, Landmark,
  ShieldAlert, AlertCircle, FileText, Activity, Layers, ArrowRight,
  TrendingUp, BarChart2, LayoutDashboard, Factory, ShoppingCart,
  Zap, Plus, ArrowUpRight,
} from "lucide-react"
import Link from "next/link"
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts"
import { buildDashboardData } from "@/mockdata/dashboard"
import type { DashboardSummary } from "@/lib/server/data/dashboard"
import { useData } from "@/lib/data-provider"
import { StatStrip } from "@/components/stat-strip"
import { useModules } from "@/components/module-provider"
import type { ModuleId } from "@/lib/modules"

type TabId = "overview" | "manufacturing" | "inventory" | "procurement"

/** Compact ₹ formatter (Cr / L / plain) for the headline valuation tile. */
function compactINR(n: number): string {
  if (n >= 1e7) return `₹ ${(n / 1e7).toFixed(2)} Cr`
  if (n >= 1e5) return `₹ ${(n / 1e5).toFixed(2)} L`
  return `₹ ${Math.round(n).toLocaleString("en-IN")}`
}

export default function Dashboard() {
  const [mounted, setMounted] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<TabId>("overview")
  const { isEnabled } = useModules()

  const d = useData()
  const { PRODUCT_STATUS, LOW_STOCK, SINGLE_SUPPLIER, TOP_CONSUMED, USAGE_IMPACT, INVENTORY_CHART } =
    React.useMemo(() => buildDashboardData(d), [d])

  // Operational aggregates not derivable from the catalog bootstrap (/api/dashboard).
  const [ops, setOps] = React.useState<DashboardSummary | null>(null)

  // Sync state on mount to prevent SSR hydration mismatch
  React.useEffect(() => {
    setMounted(true)
      ; (async () => {
        try {
          const res = await fetch("/api/dashboard", { cache: "no-store" })
          const body = await res.json().catch(() => null)
          if (res.ok && body?.data) setOps(body.data as DashboardSummary)
        } catch {
          // leave ops null — panels render empty
        }
      })()
  }, [])

  const allKpis: { title: string; value: string; desc: string; icon: React.ComponentType<{ className?: string }>; color: string; moduleId?: ModuleId }[] = [
    { title: "Products", value: d.PRODUCTS.length.toLocaleString(), desc: "Total finished items", icon: Package, color: "text-primary bg-primary/10" },
    { title: "PCBs", value: d.PCBS.length.toLocaleString(), desc: "Board variations", icon: Cpu, color: "text-primary bg-primary/10" },
    { title: "Components", value: d.COMPONENTS.length.toLocaleString(), desc: "Active raw parts catalog", icon: Nut, color: "text-primary bg-primary/10" },
    { title: "Suppliers", value: d.SUPPLIERS.length.toLocaleString(), desc: "Registered distributors", icon: Truck, color: "text-primary bg-primary/10" },
    { title: "Brands", value: d.BRANDS.length.toLocaleString(), desc: "Approved manufacturers", icon: Award, color: "text-primary bg-primary/10" },
    { title: "Inventory Value", value: compactINR(ops?.inventoryValue ?? 0), desc: "Physical asset valuation", icon: Landmark, color: "text-success bg-success/10", moduleId: "inventory" },
  ]
  const kpis = allKpis.filter((kpi) => !kpi.moduleId || isEnabled(kpi.moduleId))

  // Catalog panels derive from the bootstrap store; operational panels from /api/dashboard.
  const productStatus = PRODUCT_STATUS
  const productionBlockers = ops?.productionBlockers ?? []
  const lowStock = LOW_STOCK
  const purchaseSummary = ops?.purchaseSummary ?? []
  const productionOrders = ops?.recentProductionOrders ?? []
  const singleSupplierComponents = SINGLE_SUPPLIER
  const topConsumed = TOP_CONSUMED
  const usageImpact = USAGE_IMPACT
  const recentActivities = ops?.recentActivities ?? []
  const inventoryChartData = INVENTORY_CHART

  const allTabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }>; alert?: number; moduleId?: ModuleId }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "manufacturing", label: "Manufacturing", icon: Factory, alert: productionBlockers.length, moduleId: "production" },
    { id: "inventory", label: "Inventory", icon: Package, alert: lowStock.length, moduleId: "inventory" },
    { id: "procurement", label: "Procurement", icon: ShoppingCart, moduleId: "purchasing" },
  ]
  const tabs = allTabs.filter((tab) => !tab.moduleId || isEnabled(tab.moduleId))

  // If the active tab's module was just disabled, fall back to Overview
  const effectiveTab: TabId = tabs.some((tab) => tab.id === activeTab) ? activeTab : "overview"

  const allQuickLinks: { label: string; desc: string; href: string; icon: React.ComponentType<{ className?: string }>; accent: string; moduleId?: ModuleId }[] = [
    { label: "Add Component", desc: "Register a new raw part", href: "/components/add", icon: Plus, accent: "text-emerald-600 bg-emerald-500/10" },
    { label: "Component List", desc: "Browse parts catalog", href: "/components/list", icon: Nut, accent: "text-primary bg-primary/10" },
    { label: "Inventory", desc: "Stock & valuation", href: "/components/inventory", icon: Package, accent: "text-primary bg-primary/10", moduleId: "inventory" },
    { label: "Production Planner", desc: "Schedule builds", href: "/production/planner", icon: Factory, accent: "text-primary bg-primary/10", moduleId: "production" },
    { label: "Purchase Requests", desc: "Raise & approve PRs", href: "/purchases/requests", icon: ShoppingCart, accent: "text-primary bg-primary/10", moduleId: "purchasing" },
    { label: "Suppliers", desc: "Distributor directory", href: "/suppliers/list", icon: Truck, accent: "text-primary bg-primary/10" },
    { label: "PCB Management", desc: "Board variations", href: "/pcb-management/list", icon: Cpu, accent: "text-primary bg-primary/10" },
    { label: "Reports", desc: "Analytics & exports", href: "/reports", icon: BarChart2, accent: "text-primary bg-primary/10", moduleId: "reports" },
  ]
  const quickLinks = allQuickLinks.filter((link) => !link.moduleId || isEnabled(link.moduleId))

  // ─── Card definitions (each lives in exactly one category) ───────────────

  const readinessCard = (
    <Card className="border border-border shadow-sm">
      <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-lg font-bold">Manufacturing Readiness</CardTitle>
            <CardDescription>Audited inventory build capability by finished item</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm text-left text-foreground">
          <thead className="bg-muted/40 text-muted-foreground border-b border-border font-semibold uppercase text-xs">
            <tr>
              <th scope="col" className="px-6 py-3">Product</th>
              <th scope="col" className="px-6 py-3 text-center">Status</th>
              <th scope="col" className="px-6 py-3 text-right">Buildable Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {productStatus.map((item, idx) => (
              <tr key={idx} className="hover:bg-muted/10 transition-colors">
                <td className="px-6 py-3.5 font-bold">{item.product}</td>
                <td className="px-6 py-3.5 text-center">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold border ${item.status === "Ready"
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                      : item.status === "Blocked"
                        ? "bg-destructive/10 border-destructive/20 text-destructive"
                        : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
                    }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${item.status === "Ready" ? "bg-emerald-500" : item.status === "Blocked" ? "bg-destructive" : "bg-amber-500"
                      }`} />
                    {item.status}
                  </span>
                </td>
                <td className="px-6 py-3.5 text-right font-mono font-bold text-foreground">
                  {item.buildableQty.toLocaleString()} units
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )

  const blockersCard = (
    <Card className="border border-destructive/30 bg-destructive/5 dark:bg-red-950/10 shadow-sm overflow-hidden">
      <CardHeader className="border-b border-destructive/10 bg-destructive/10 px-6 py-4 flex flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-destructive">
          <ShieldAlert className="h-5 w-5" />
          <div>
            <CardTitle className="text-lg font-bold">Production Blockers</CardTitle>
            <CardDescription className="text-destructive/80 mt-0.5">Critical material shortages blocking scheduled builds</CardDescription>
          </div>
        </div>
        <Button
          variant="destructive"
          size="sm"
          className="font-bold cursor-pointer text-xs shrink-0"
          render={<Link href="/purchases/requests" />}
        >
          <span>View Purchase Options</span>
          <ArrowRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </CardHeader>
      <CardContent className="p-0 divide-y divide-destructive/20 text-sm">
        {productionBlockers.map((item, idx) => (
          <div key={idx} className="flex justify-between items-center px-6 py-3.5 hover:bg-destructive/10 transition-colors">
            <div className="flex flex-col">
              <span className="font-bold text-foreground">{item.product}</span>
              <span className="text-xs text-muted-foreground">Missing Component: <strong className="text-foreground">{item.missingComp}</strong></span>
            </div>
            <span className="font-mono font-extrabold text-destructive">
              -{item.qty} units
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )

  const lowStockCard = (
    <Card className="border border-border shadow-sm">
      <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-amber-500" />
          <div>
            <CardTitle className="text-lg font-bold">Low Stock Components</CardTitle>
            <CardDescription>BOM catalog items below safety margins</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm text-left text-foreground">
          <thead className="bg-muted/40 text-muted-foreground border-b border-border font-semibold uppercase text-xs">
            <tr>
              <th scope="col" className="px-6 py-3">Component</th>
              <th scope="col" className="px-6 py-3">Current</th>
              <th scope="col" className="px-6 py-3">Minimum</th>
              <th scope="col" className="px-6 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lowStock.map((item, idx) => (
              <tr key={idx} className="hover:bg-muted/10 transition-colors">
                <td className="px-6 py-3.5 font-bold">
                  <Link href="/components/list" className="text-primary hover:underline">{item.component}</Link>
                </td>
                <td className="px-6 py-3.5 font-mono text-destructive font-bold">{item.current.toLocaleString()}</td>
                <td className="px-6 py-3.5 font-mono text-muted-foreground">{item.minimum.toLocaleString()}</td>
                <td className="px-6 py-3.5 text-right">
                  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${item.status === "Critical"
                      ? "bg-destructive/10 border-destructive/20 text-destructive"
                      : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
                    }`}>
                    {item.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )

  const purchaseSummaryCard = (
    <div className="grid gap-4 sm:grid-cols-3">
      {purchaseSummary.map((item, idx) => (
        <Card key={idx} className="border border-border shadow-xs hover:shadow-md transition-shadow">
          <CardHeader className="p-4 pb-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{item.title}</span>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-black text-primary">{item.value}</div>
            <p className="text-[10px] text-muted-foreground leading-normal mt-1">{item.desc}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )

  const ordersCard = (
    <Card className="border border-border shadow-sm">
      <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-lg font-bold">Recent Production Orders</CardTitle>
            <CardDescription>Scheduled assembly run dispatching logs</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm text-left text-foreground">
          <thead className="bg-muted/40 text-muted-foreground border-b border-border font-semibold uppercase text-xs">
            <tr>
              <th scope="col" className="px-6 py-3">Order</th>
              <th scope="col" className="px-6 py-3">Product</th>
              <th scope="col" className="px-6 py-3">Qty</th>
              <th scope="col" className="px-6 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {productionOrders.map((order, idx) => (
              <tr key={idx} className="hover:bg-muted/10 transition-colors">
                <td className="px-6 py-3.5 font-mono font-bold text-primary">{order.orderId}</td>
                <td className="px-6 py-3.5 font-bold">{order.product}</td>
                <td className="px-6 py-3.5 font-mono">{order.qty}</td>
                <td className="px-6 py-3.5 text-right">
                  <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${order.status === "Completed"
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                      : "bg-primary/10 border-primary/20 text-primary"
                    }`}>
                    {order.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )

  const supplierRiskCard = (
    <Card className="border border-border shadow-sm">
      <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-lg font-bold">Supplier Risk Dashboard</CardTitle>
            <CardDescription>BOM material dependency vulnerabilities tracking</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {/* Single Source Table */}
        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
            Single Supplier Components
          </span>
          <div className="border border-border rounded-lg overflow-hidden bg-background">
            <table className="w-full text-xs text-left text-foreground">
              <thead className="bg-muted uppercase text-[10px] text-muted-foreground border-b border-border font-semibold">
                <tr>
                  <th className="px-4 py-2">Component</th>
                  <th className="px-4 py-2 text-right">Sole Supplier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {singleSupplierComponents.map((s, idx) => (
                  <tr key={idx} className="hover:bg-muted/5">
                    <td className="px-4 py-2.5 font-bold">
                      <Link href="/components/list" className="text-primary hover:underline">{s.component}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-muted-foreground">{s.supplier}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Production Risk Warning */}
        <div className="bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/10 dark:border-amber-500/20 rounded-xl p-4 flex gap-3 text-xs leading-normal">
          <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-extrabold text-amber-800 dark:text-amber-400 uppercase tracking-wider block">Production Risk Warning</span>
            <p className="text-muted-foreground">
              Sole supplier vulnerabilities identified. If the account managers for ABC Electronics or XYZ Components disappear, production of the Audio Codec and GSM modules will immediately block. Register qualified back-up manufacturing brands.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  const inventoryChartCard = (
    <Card className="border border-border shadow-sm flex flex-col justify-between">
      <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-lg font-bold">Inventory Distribution</CardTitle>
            <CardDescription>BOM asset ratio by category</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 flex-1 flex flex-col justify-center items-center">
        {mounted ? (
          <div className="h-[220px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={inventoryChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {inventoryChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "var(--card)", borderColor: "var(--border)", borderRadius: "var(--radius)" }}
                  itemStyle={{ color: "var(--foreground)" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">
            Rendering distribution graph...
          </div>
        )}

        {/* Chart Legend */}
        <div className="flex gap-4 text-xs font-bold uppercase tracking-wider text-muted-foreground/80 mt-4">
          {inventoryChartData.map((item, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: item.color }} />
              <span>{item.name} ({item.value})</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )

  const consumptionCard = (
    <Card className="border border-border shadow-sm space-y-4 p-6">
      {/* Top Consumed Components */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h3 className="text-base font-bold text-foreground">Top Consumed Components</h3>
        </div>
        <div className="border border-border rounded-lg overflow-hidden bg-background text-xs">
          <table className="w-full text-left text-foreground">
            <thead className="bg-muted uppercase text-[10px] text-muted-foreground border-b border-border font-semibold">
              <tr>
                <th className="px-4 py-2">Component</th>
                <th className="px-4 py-2 text-right">Monthly Usage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {topConsumed.map((item, idx) => (
                <tr key={idx} className="hover:bg-muted/5">
                  <td className="px-4 py-2 font-bold">{item.component}</td>
                  <td className="px-4 py-2 text-right font-mono font-bold text-primary">{item.monthlyUsage} units</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Component Usage Impact */}
      <div className="space-y-3 border-t border-border/50 pt-4">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          <h3 className="text-base font-bold text-foreground">Component Usage Impact</h3>
        </div>
        <div className="border border-border rounded-lg overflow-hidden bg-background text-xs">
          <table className="w-full text-left text-foreground">
            <thead className="bg-muted uppercase text-[10px] text-muted-foreground border-b border-border font-semibold">
              <tr>
                <th className="px-4 py-2">Component</th>
                <th className="px-4 py-2 text-right">Used In Products</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-medium">
              {usageImpact.map((item, idx) => (
                <tr key={idx} className="hover:bg-muted/5">
                  <td className="px-4 py-2 font-bold">{item.component}</td>
                  <td className="px-4 py-2 text-right font-mono text-primary font-bold">{item.usedInProducts} products</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-[10px] leading-relaxed text-muted-foreground bg-muted/40 p-2 rounded border border-border/40 font-semibold uppercase tracking-wider text-center">
          ⚠️ If Audio Codec is unavailable, 6 products are affected.
        </div>
      </div>
    </Card>
  )

  const quickLinksCard = (
    <Card className="border border-border shadow-sm">
      <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-lg font-bold">Quick Links</CardTitle>
            <CardDescription>Jump to frequent workspaces and actions</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {quickLinks.map((link) => {
            const Icon = link.icon
            return (
              <Link
                key={link.href}
                href={link.href}
                className="group flex items-center gap-3 rounded-lg border border-border bg-background p-3 transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm"
              >
                <div className={`h-9 w-9 shrink-0 flex items-center justify-center rounded-lg ${link.accent}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate text-foreground">{link.label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{link.desc}</p>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/30 transition-colors group-hover:text-primary" />
              </Link>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )

  const activitiesCard = (
    <Card className="border border-border shadow-sm flex flex-col justify-between">
      <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-lg font-bold">Recent Activities</CardTitle>
            <CardDescription>Audit timeline events ledger</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 flex-1 flex flex-col justify-between">
        <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-1.5 before:bottom-1.5 before:w-[1.5px] before:bg-border/60">
          {recentActivities.map((act, idx) => (
            <div key={idx} className="relative group text-xs">
              <span className="absolute -left-6.5 top-1 h-2.5 w-2.5 rounded-full border border-primary bg-background group-hover:bg-primary transition-colors" />
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold text-foreground leading-normal">{act.text}</span>
                <span className="text-[10px] text-muted-foreground font-mono">{act.time}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Operational Control Center
        </span>
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground md:text-3xl">
          Dashboard
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          StackIOT Technologies Pvt. Ltd. — real-time BOM readiness auditing, logistics analytics, and supply-chain risk indicators.
        </p>
      </div>

      {/* Global KPI readout — joined instrument-panel strip (always visible) */}
      <StatStrip
        items={kpis.map((kpi) => ({
          label: kpi.title,
          value: kpi.value,
          desc: kpi.desc,
          icon: kpi.icon,
          tone: kpi.color.includes("success") ? "success" : "default",
        }))}
      />

      {/* Category Navbar */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = effectiveTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors cursor-pointer ${active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {tab.alert ? (
                  <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive/10 px-1 text-[10px] font-bold text-destructive">
                    {tab.alert}
                  </span>
                ) : null}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab Panels */}
      {effectiveTab === "overview" && (
        <div className="space-y-6">
          {quickLinksCard}
          <div className="grid gap-6 lg:grid-cols-2">
            {inventoryChartCard}
            {activitiesCard}
          </div>
        </div>
      )}

      {effectiveTab === "manufacturing" && (
        <div className="space-y-6">
          {readinessCard}
          <div className="grid gap-6 lg:grid-cols-2">
            {blockersCard}
            {ordersCard}
          </div>
        </div>
      )}

      {effectiveTab === "inventory" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {lowStockCard}
          {consumptionCard}
        </div>
      )}

      {effectiveTab === "procurement" && (
        <div className="space-y-6">
          {purchaseSummaryCard}
          {supplierRiskCard}
        </div>
      )}
    </div>
  )
}
