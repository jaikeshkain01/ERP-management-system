"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { 
  Package, Cpu, Nut, Truck, Award, Landmark, 
  CheckCircle2, XCircle, AlertTriangle, ShieldAlert, 
  AlertCircle, FileText, Activity, Layers, ArrowRight,
  TrendingUp, RefreshCw, BarChart2, Star
} from "lucide-react"
import Link from "next/link"
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts"

// Data Structures
interface ProductStatusItem {
  product: string
  status: "Ready" | "Blocked" | "Limited"
  buildableQty: number
}

interface BlockerItem {
  product: string
  missingComp: string
  qty: number
}

interface LowStockItem {
  component: string
  current: number
  minimum: number
  status: "Critical" | "Low" | "Healthy"
}

interface SingleSupplierItem {
  component: string
  supplier: string
}

interface ProductionOrder {
  orderId: string
  product: string
  qty: number
  status: "In Progress" | "Completed" | "Draft"
}

interface ConsumedComponent {
  component: string
  monthlyUsage: string
}

interface UsageImpactItem {
  component: string
  usedInProducts: number
}

interface ActivityItem {
  text: string
  time: string
}

export default function Dashboard() {
  const [mounted, setMounted] = React.useState(false)

  // Sync state on mount to prevent SSR hydration mismatch
  React.useEffect(() => {
    setMounted(true)
  }, [])

  const kpis = [
    { title: "Products", value: "15", desc: "Total finished items", icon: Package, color: "text-primary bg-primary/10" },
    { title: "PCBs", value: "48", desc: "Board variations", icon: Cpu, color: "text-primary bg-primary/10" },
    { title: "Components", value: "1,250", desc: "Active raw parts catalog", icon: Nut, color: "text-primary bg-primary/10" },
    { title: "Suppliers", value: "35", desc: "Registered distributors", icon: Truck, color: "text-primary bg-primary/10" },
    { title: "Brands", value: "420", desc: "Approved manufacturers", icon: Award, color: "text-primary bg-primary/10" },
    { title: "Inventory Value", value: "₹ 2.4 Cr", desc: "Physical asset valuation", icon: Landmark, color: "text-emerald-600 bg-emerald-500/10" },
  ]

  const productStatus: ProductStatusItem[] = [
    { product: "ROIP 400", status: "Ready", buildableQty: 120 },
    { product: "Voice Logger", status: "Blocked", buildableQty: 0 },
    { product: "Dispatcher", status: "Limited", buildableQty: 20 },
  ]

  const productionBlockers: BlockerItem[] = [
    { product: "ROIP400", missingComp: "LED Green", qty: 500 },
    { product: "Voice Logger", missingComp: "Audio Codec", qty: 25 },
  ]

  const lowStock: LowStockItem[] = [
    { component: "LED Green", current: 300, minimum: 1000, status: "Low" },
    { component: "Audio Codec", current: 25, minimum: 100, status: "Critical" },
  ]

  const purchaseSummary = [
    { title: "Pending PRs", value: 12, desc: "Awaiting manager approval" },
    { title: "Open POs", value: 8, desc: "Shipment agreements in transit" },
    { title: "Expected Deliveries", value: 5, desc: "Due within next 7 days" },
  ]

  const productionOrders: ProductionOrder[] = [
    { orderId: "PROD-001", product: "ROIP400", qty: 100, status: "In Progress" },
    { orderId: "PROD-002", product: "Voice Logger", qty: 50, status: "Completed" },
  ]

  const singleSupplierComponents: SingleSupplierItem[] = [
    { component: "Audio Codec", supplier: "ABC Electronics" },
    { component: "GSM Chip", supplier: "XYZ Components" },
  ]

  const topConsumed: ConsumedComponent[] = [
    { component: "Resistor 10K", monthlyUsage: "50,000" },
    { component: "Capacitor 100uF", monthlyUsage: "30,000" },
    { component: "LED Green", monthlyUsage: "15,000" },
  ]

  const usageImpact: UsageImpactItem[] = [
    { component: "Resistor 10K", usedInProducts: 12 },
    { component: "LED Green", usedInProducts: 8 },
    { component: "Audio Codec", usedInProducts: 6 },
  ]

  const recentActivities: ActivityItem[] = [
    { text: "ABC Electronics added as preferred supplier for Resistor 10K", time: "10 mins ago" },
    { text: "Purchase Order PO-104 created and sent to XYZ Components", time: "1 hour ago" },
    { text: "ROIP400 engineering BOM structure updated", time: "3 hours ago" },
    { text: "100 units of Audio PCB produced and transferred to stock", time: "5 hours ago" },
    { text: "Voice Logger production batch PROD-002 completed successfully", time: "1 day ago" },
  ]

  // Recharts Data Setup
  const inventoryChartData = [
    { name: "Components", value: 1250, color: "#875A7B" },
    { name: "PCBs", value: 48, color: "#28C76F" },
    { name: "Products", value: 15, color: "#FF9F43" },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="text-muted-foreground text-sm md:text-base">
          StackIOT Technologies Pvt. Ltd. — Enterprise operational control center. Real-time BOM readiness auditing, logistics analytics, and supply indicators.
        </p>
      </div>

      {/* Priority 1: Top KPI Cards Grid */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon
          return (
            <Card key={idx} className="relative overflow-hidden transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group">
              <div className="absolute top-0 right-0 h-16 w-16 -mr-3 -mt-3 rounded-full bg-primary/5 transition-all group-hover:scale-110" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{kpi.title}</CardTitle>
                <div className={`h-8 w-8 flex items-center justify-center rounded-lg ${kpi.color}`}>
                  <Icon className="h-4.5 w-4.5" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-2xl font-black text-foreground tracking-tight">{kpi.value}</div>
                <p className="text-[10px] text-muted-foreground truncate mt-1">{kpi.desc}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Main Grid: Priorities 2 to 7 */}
      <div className="grid gap-6 lg:grid-cols-2">
        
        {/* Left Side: Production Control Operations (Readiness, Blockers, Low Stock) */}
        <div className="space-y-6">
          
          {/* Priority 2: Manufacturing Readiness */}
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
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold border ${
                          item.status === "Ready"
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                            : item.status === "Blocked"
                            ? "bg-destructive/10 border-destructive/20 text-destructive"
                            : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            item.status === "Ready" ? "bg-emerald-500" : item.status === "Blocked" ? "bg-destructive" : "bg-amber-500"
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

          {/* Priority 3: Production Blockers */}
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
                className="font-bold cursor-pointer text-xs"
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

          {/* Priority 4: Low Stock Components */}
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
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${
                          item.status === "Critical"
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

        </div>

        {/* Right Side: Procurement Operations (Summary, Orders, Supplier Risk) */}
        <div className="space-y-6">
          
          {/* Priority 5: Purchase Summary */}
          <div className="grid gap-4 sm:grid-cols-3">
            {purchaseSummary.map((item, idx) => (
              <Card key={idx} className="border border-border shadow-xs hover:shadow-md transition-shadow">
                <CardHeader className="p-4 pb-2">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{item.title}</span>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="text-2xl font-black text-primary font-mono">{item.value}</div>
                  <p className="text-[10px] text-muted-foreground leading-normal mt-1">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Priority 6: Recent Production Orders */}
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
                        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${
                          order.status === "Completed"
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                            : "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400"
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

          {/* Priority 7: Supplier Risk Dashboard */}
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

        </div>

      </div>

      {/* Bottom Grid: Priorities 8 to 10 */}
      <div className="grid gap-6 lg:grid-cols-3">
        
        {/* Priority 8: Inventory Distribution Chart */}
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
              <div className="h-[200px] w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={inventoryChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
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
              <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
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

        {/* Priority 9: Top Consumed Components & Component Usage Impact */}
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

        {/* Priority 10: Recent Activities */}
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
                  {/* Timeline bullet */}
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

      </div>
    </div>
  )
}
