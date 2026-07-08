"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { BarChart3, TrendingUp, Users, Clock, Percent } from "lucide-react"
import { StatStrip } from "@/components/stat-strip"
import { PRODUCTION_YIELD as productionData } from "@/mockdata/reports"

const chartConfig = {
  yield: {
    label: "Yield Units",
    color: "hsl(var(--primary))",
  },
}

export default function ReportsPage() {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const stats = [
    { title: "Total Batches Run", value: "186", description: "+12 from last month", icon: TrendingUp },
    { title: "Units Produced", value: "3,420", description: "+8% production volume", icon: BarChart3 },
    { title: "Avg Yield Rate", value: "98.6%", description: "+0.4% efficiency increase", icon: Percent },
    { title: "Avg Lead Time", value: "4.2 Days", description: "-0.8 days optimization", icon: Clock },
  ]

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
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold text-foreground">ROIP 400</span>
                  <span className="font-mono text-muted-foreground">75% (2,565 Units)</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full" style={{ width: "75%" }} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-semibold text-foreground">Voice Logger</span>
                  <span className="font-mono text-muted-foreground">25% (855 Units)</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-primary/50 h-2 rounded-full" style={{ width: "25%" }} />
                </div>
              </div>
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
