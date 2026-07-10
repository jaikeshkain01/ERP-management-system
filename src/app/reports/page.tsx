"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { BarChart3, TrendingUp, Users, Clock, Percent } from "lucide-react"
import { StatStrip } from "@/components/stat-strip"
import { PRODUCTION_YIELD, type MonthlyYield } from "@/mockdata/reports"
import type { ReportsSummary } from "@/lib/server/data/production"

const chartConfig = {
  yield: {
    label: "Yield Units",
    color: "hsl(var(--primary))",
  },
}

export default function ReportsPage() {
  const [mounted, setMounted] = React.useState(false)
  const [productionData, setProductionData] = React.useState<MonthlyYield[]>(PRODUCTION_YIELD)
  const [summary, setSummary] = React.useState<ReportsSummary | null>(null)

  React.useEffect(() => {
    setMounted(true)
    ;(async () => {
      try {
        const [yieldRes, summaryRes] = await Promise.all([
          fetch("/api/reports/yield?range=6m", { cache: "no-store" }),
          fetch("/api/reports/summary", { cache: "no-store" }),
        ])
        const yieldBody = await yieldRes.json().catch(() => null)
        if (yieldRes.ok && Array.isArray(yieldBody?.data) && yieldBody.data.length) setProductionData(yieldBody.data)
        const summaryBody = await summaryRes.json().catch(() => null)
        if (summaryRes.ok && summaryBody?.data) setSummary(summaryBody.data as ReportsSummary)
      } catch {
        // keep the static fallback series
      }
    })()
  }, [])

  const stats = [
    { title: "Total Batches Run", value: (summary?.totalBatches ?? 0).toLocaleString(), description: "Completed production batches", icon: TrendingUp },
    { title: "Units Produced", value: (summary?.unitsProduced ?? 0).toLocaleString(), description: "Total finished output volume", icon: BarChart3 },
    { title: "Avg Yield Rate", value: `${(summary?.avgYield ?? 0).toFixed(1)}%`, description: "Completed vs. cancelled batches", icon: Percent },
    { title: "Avg Lead Time", value: `${(summary?.avgLeadTimeDays ?? 0).toFixed(1)} Days`, description: "Create → complete duration", icon: Clock },
  ]

  const distribution = summary?.distribution ?? []
  const distTotal = distribution.reduce((s, r) => s + r.units, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <span>Reports</span>
          <span>/</span>
          <span className="text-foreground font-medium">Performance Analytics</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          Monitor manufacturing velocity, yield efficiency rates, and history logs.
        </p>
      </div>

      {/* KPI readout — instrument strip */}
      <StatStrip
        items={stats.map((stat) => ({
          label: stat.title,
          value: stat.value,
          desc: stat.description,
          icon: stat.icon,
        }))}
      />

      {/* Chart Section */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Chart */}
        <Card className="md:col-span-2 border border-border shadow-sm">
          <CardHeader className="border-b border-border bg-muted/20">
            <CardTitle className="text-lg font-bold">Monthly Production Output</CardTitle>
            <CardDescription>Yield count of finished products over the last 6 months</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-[320px] w-full">
              {mounted ? (
                <ChartContainer config={chartConfig} className="h-[320px] w-full">
                  <BarChart data={productionData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                    <XAxis 
                      dataKey="month" 
                      tickLine={false}
                      axisLine={false}
                      className="text-xs text-muted-foreground"
                    />
                    <YAxis 
                      tickLine={false}
                      axisLine={false}
                      className="text-xs text-muted-foreground"
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar 
                      dataKey="yield" 
                      fill="var(--color-yield)" 
                      radius={[4, 4, 0, 0]} 
                    />
                  </BarChart>
                </ChartContainer>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm font-medium">
                  Loading analytics chart...
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Secondary Report Details */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="border-b border-border bg-muted/20">
            <CardTitle className="text-lg font-bold">Distribution Summary</CardTitle>
            <CardDescription>Breakdown by product line</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-4">
              {distribution.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No completed production orders yet.
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
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className={idx === 0 ? "bg-primary h-2 rounded-full" : "bg-primary/50 h-2 rounded-full"}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="border-t border-border/50 pt-4 space-y-2 text-xs text-muted-foreground/80">
              <p>• Data is refreshed every 15 minutes from completed production orders.</p>
              <p className="mt-1">• To export reports to CSV or PDF formats, configure settings hooks.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
