"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Nut, Cpu, Package, Activity, Layers, AlertTriangle, ShieldCheck, Check, Clock, TrendingUp } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts"
import { useData } from "@/lib/data-provider"

interface MonthUsage {
  month: string
  usage: number
}

interface ComponentUsageData {
  id: string
  displayName: string
  category: string
  usedInProductsCount: number
  usedInPCBsCount: number
  annualConsumption: number
  currentStock: number
  coverageDays: string
  coverageNum: number
  unit: string
  description: string
  trendData: MonthUsage[]
}

const USAGE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// Deterministic 12-month trend derived from annual consumption (SSR-stable).
const buildTrend = (annual: number): MonthUsage[] => {
  const base = Math.round(annual / 12)
  return USAGE_MONTHS.map((month, i) => ({
    month,
    usage: Math.round(base * (0.85 + ((i * 13) % 7) / 20)),
  }))
}

// Usage view model derived from the active store (mockdata or DB).
function buildComponentsUsageData(d: ReturnType<typeof useData>): Record<string, ComponentUsageData> {
  return Object.fromEntries(
    d.COMPONENTS.map((c) => {
      const coverageNum =
        c.annualConsumption > 0 ? Math.round(c.stock / (c.annualConsumption / 365)) : 0
      return [
        c.id,
        {
          id: c.id,
          displayName: c.name,
          category: c.category,
          usedInProductsCount: d.productsUsingComponent(c.id).length,
          usedInPCBsCount: d.pcbsUsingComponent(c.id).length,
          annualConsumption: c.annualConsumption,
          currentStock: c.stock,
          coverageDays: `${coverageNum} Days`,
          coverageNum,
          unit: c.unit,
          description: c.description,
          trendData: buildTrend(c.annualConsumption),
        } satisfies ComponentUsageData,
      ]
    }),
  )
}

export default function ComponentUsageAnalysisPage() {
  const d = useData()
  const COMPONENTS_USAGE_DATA = React.useMemo(() => buildComponentsUsageData(d), [d])
  const [searchTerm, setSearchTerm] = React.useState("")
  const [selectedCompId, setSelectedCompId] = React.useState<string>(() => d.COMPONENTS[0]?.id ?? "")
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Filter components based on search string
  const filteredComponents = Object.values(COMPONENTS_USAGE_DATA).filter((comp) =>
    comp.displayName.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Determine active component selection
  const activeComponent = COMPONENTS_USAGE_DATA[selectedCompId] || Object.values(COMPONENTS_USAGE_DATA)[0]

  // Fallback if current search filters out everything
  const displayedComponent = filteredComponents.find(c => c.id === selectedCompId) || filteredComponents[0] || activeComponent

  const handleSelectComponent = (id: string) => {
    setSelectedCompId(id)
  }

  // Stock coverage safety color codes
  const getCoverageColor = (days: number) => {
    if (days <= 15) return "text-destructive bg-destructive/10 border-destructive/25 dark:text-red-400"
    if (days <= 45) return "text-amber-600 bg-amber-500/10 border-amber-500/20 dark:text-amber-400"
    return "text-emerald-600 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-400"
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <span>Components</span>
          <span>/</span>
          <span className="text-foreground font-medium">Usage Analysis</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Usage & Coverage Analysis</h1>
        <p className="text-muted-foreground">
          Track component allocation metrics, check stock coverage rates, and project replenishment demands.
        </p>
      </div>

      {/* Main Container Layout */}
      <div className="grid gap-6 lg:grid-cols-4 items-start">
        {/* Left Search List Panel */}
        <div className="space-y-4 lg:col-span-1">
          <Card className="border border-border shadow-sm">
            <CardHeader className="pb-3 bg-muted/20 border-b border-border">
              <CardTitle className="text-sm font-bold">Search Component</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Type to filter..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 bg-background border-border"
                />
              </div>

              {/* Items List */}
              <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
                {filteredComponents.map((comp) => (
                  <button
                    key={comp.id}
                    onClick={() => handleSelectComponent(comp.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs font-semibold transition-all select-none border border-transparent ${
                      displayedComponent.id === comp.id
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                    }`}
                  >
                    <Nut className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{comp.displayName}</span>
                  </button>
                ))}
                {filteredComponents.length === 0 && (
                  <div className="text-center py-6 text-xs text-muted-foreground">
                    No components found.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Details Panel */}
        <div className="lg:col-span-3 space-y-6">
          {/* Main Summary Section */}
          <Card className="border border-border shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/20 px-6 py-4 border-b border-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Nut className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold">{displayedComponent.displayName}</CardTitle>
                    <CardDescription className="text-xs mt-0.5">{displayedComponent.category} — Usage Breakdown</CardDescription>
                  </div>
                </div>
                
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${getCoverageColor(displayedComponent.coverageNum)}`}>
                  {displayedComponent.coverageNum <= 15 ? (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  ) : displayedComponent.coverageNum <= 45 ? (
                    <Clock className="h-3.5 w-3.5" />
                  ) : (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  )}
                  <span>Coverage: {displayedComponent.coverageDays}</span>
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-xs text-muted-foreground leading-normal mb-6">{displayedComponent.description}</p>

              {/* Result KPI Metrics Grid */}
              <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
                <div className="bg-secondary/20 border border-border/60 p-3.5 rounded-lg flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground leading-none">Used In Products</span>
                  <div className="flex items-center gap-2 mt-1">
                    <Package className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-xl font-extrabold text-foreground">{displayedComponent.usedInProductsCount}</span>
                  </div>
                </div>

                <div className="bg-secondary/20 border border-border/60 p-3.5 rounded-lg flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground leading-none">Used In PCBs</span>
                  <div className="flex items-center gap-2 mt-1">
                    <Cpu className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-xl font-extrabold text-foreground">{displayedComponent.usedInPCBsCount}</span>
                  </div>
                </div>

                <div className="bg-secondary/20 border border-border/60 p-3.5 rounded-lg flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground leading-none">Annual Usage</span>
                  <div className="flex items-center gap-2 mt-1">
                    <Activity className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-xl font-extrabold text-foreground font-mono">{displayedComponent.annualConsumption.toLocaleString()}</span>
                  </div>
                </div>

                <div className="bg-secondary/20 border border-border/60 p-3.5 rounded-lg flex flex-col gap-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground leading-none">Current Stock</span>
                  <div className="flex items-center gap-2 mt-1">
                    <Layers className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-xl font-extrabold text-foreground font-mono">{displayedComponent.currentStock.toLocaleString()}</span>
                  </div>
                </div>

                <div className="bg-secondary/20 border border-border/60 p-3.5 rounded-lg flex flex-col gap-1.5 col-span-2 md:col-span-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground leading-none">Coverage Rate</span>
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-xl font-extrabold text-foreground font-mono">{displayedComponent.coverageDays}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Consumption Trend Graphic */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="bg-muted/20 px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base font-bold">Monthly Consumption Trend</CardTitle>
                  <CardDescription>BOM material consumption log over the last 12 months</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {mounted ? (
                <div className="h-[250px] w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={displayedComponent.trendData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="usageGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.01}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis 
                        dataKey="month" 
                        stroke="var(--muted-foreground)" 
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis 
                        stroke="var(--muted-foreground)" 
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "var(--card)", 
                          borderColor: "var(--border)", 
                          borderRadius: "var(--radius)",
                          fontSize: "12px",
                          fontWeight: "600"
                        }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="usage" 
                        stroke="var(--primary)" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#usageGradient)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[250px] w-full flex items-center justify-center text-muted-foreground text-xs font-semibold">
                  Drawing Trend Graph...
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
