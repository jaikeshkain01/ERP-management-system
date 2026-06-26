"use client"

import * as React from "react"
import Link from "next/link"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Cpu, Nut, Plus, Search, Layers, ArrowRight,
  CircuitBoard, Boxes, CheckCircle2, FlaskConical,
  Archive, RefreshCw
} from "lucide-react"

type PCBStatus = "Active" | "Prototype" | "Deprecated"

interface PCBData {
  id: string
  name: string
  description: string
  componentsCount: number
  layers: number
  usedIn: string[]
  status: PCBStatus
}

const PCBS_DATA: PCBData[] = [
  {
    id: "audio-pcb",
    name: "Audio PCB",
    description: "Voice and audio signal processing board",
    componentsCount: 58,
    layers: 4,
    usedIn: ["ROIP400", "Voice Logger"],
    status: "Active",
  },
  {
    id: "gsm-pcb",
    name: "GSM PCB",
    description: "Mobile network connectivity module board",
    componentsCount: 75,
    layers: 6,
    usedIn: ["ROIP400"],
    status: "Active",
  },
  {
    id: "display-pcb",
    name: "Display PCB",
    description: "LCD screen driver interface board",
    componentsCount: 40,
    layers: 2,
    usedIn: ["ROIP400"],
    status: "Active",
  },
  {
    id: "power-pcb",
    name: "Power PCB",
    description: "Voltage regulation and power distribution board",
    componentsCount: 32,
    layers: 2,
    usedIn: ["ROIP400"],
    status: "Prototype",
  },
  {
    id: "main-pcb",
    name: "Main PCB",
    description: "Primary controller and DSP board",
    componentsCount: 80,
    layers: 8,
    usedIn: ["Voice Logger"],
    status: "Active",
  },
]

const STATUS_STYLES: Record<PCBStatus, { label: string; className: string; icon: React.ElementType }> = {
  Active: {
    label: "Active",
    icon: CheckCircle2,
    className:
      "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400",
  },
  Prototype: {
    label: "Prototype",
    icon: FlaskConical,
    className:
      "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-400",
  },
  Deprecated: {
    label: "Deprecated",
    icon: Archive,
    className:
      "bg-muted text-muted-foreground border-border",
  },
}

export default function PCBListPage() {
  const [searchQuery, setSearchQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("All")

  const handleResetFilters = () => {
    setSearchQuery("")
    setStatusFilter("All")
  }

  const filteredPcbs = PCBS_DATA.filter((pcb) => {
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase()
      const matchesSearch =
        pcb.name.toLowerCase().includes(q) ||
        pcb.description.toLowerCase().includes(q) ||
        pcb.usedIn.some((p) => p.toLowerCase().includes(q))
      if (!matchesSearch) return false
    }
    if (statusFilter !== "All" && pcb.status !== statusFilter) return false
    return true
  })

  // Summary metrics (computed across the full dataset)
  const totalPcbs = PCBS_DATA.length
  const totalComponents = PCBS_DATA.reduce((sum, pcb) => sum + pcb.componentsCount, 0)
  const activeCount = PCBS_DATA.filter((pcb) => pcb.status === "Active").length

  const renderStatusBadge = (status: PCBStatus) => {
    const { label, className, icon: Icon } = STATUS_STYLES[status]
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${className}`}
      >
        <Icon className="h-3 w-3" />
        {label}
      </span>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-muted-foreground flex items-center gap-2 font-medium">
            <span className="hover:text-foreground transition-colors cursor-pointer">PCB Management</span>
            <span>/</span>
            <span className="text-foreground font-semibold">PCB List</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            PCB List
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage circuit board schematics, layer designs, and fabrication properties.
          </p>
        </div>

        <Button className="gap-2 font-semibold self-start md:self-auto">
          <Plus className="h-4 w-4" />
          <span>Add PCB</span>
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border border-border bg-card shadow-2xs">
          <CardContent className="flex items-center gap-4 py-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/10">
              <CircuitBoard className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider">Total PCBs</span>
              <span className="text-2xl font-black text-foreground leading-tight">{totalPcbs}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-2xs">
          <CardContent className="flex items-center gap-4 py-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 border border-indigo-500/10 dark:text-indigo-400">
              <Boxes className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider">Total Components</span>
              <span className="text-2xl font-black text-foreground leading-tight">{totalComponents}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border bg-card shadow-2xs">
          <CardContent className="flex items-center gap-4 py-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/10 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider">Active Boards</span>
              <span className="text-2xl font-black text-foreground leading-tight">{activeCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Controls: Search & Filter */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-card border border-border p-4 rounded-xl shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search PCBs..."
            className="pl-9 bg-background border-border"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-semibold">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-background border border-border rounded-lg text-xs p-2 outline-none focus:ring-1 focus:ring-primary cursor-pointer text-foreground font-semibold min-w-[120px]"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Prototype">Prototype</option>
              <option value="Deprecated">Deprecated</option>
            </select>
          </div>
          {(searchQuery !== "" || statusFilter !== "All") && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={handleResetFilters}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* PCB Cards Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filteredPcbs.map((pcb) => (
          <Card
            key={pcb.id}
            className="flex flex-col transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 border border-border bg-card group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 h-16 w-16 -mr-4 -mt-4 rounded-full bg-primary/5 transition-all group-hover:scale-110" />

            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/10">
                    <Cpu className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold leading-tight group-hover:text-primary transition-colors">
                      {pcb.name}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {pcb.description}
                    </p>
                  </div>
                </div>
                <div className="shrink-0">{renderStatusBadge(pcb.status)}</div>
              </div>
            </CardHeader>

            {/* Core Metrics */}
            <CardContent className="flex-1 py-4 border-t border-b border-border/50 bg-muted/5 space-y-4">
              <div className="grid grid-cols-2 gap-x-6 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground border border-border/60">
                    <Nut className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground leading-none">Components</span>
                    <span className="text-sm font-black mt-1 text-foreground">{pcb.componentsCount}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground border border-border/60">
                    <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground leading-none">Layers</span>
                    <span className="text-sm font-black mt-1 text-foreground">{pcb.layers}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Used In</span>
                <div className="flex flex-wrap gap-1.5">
                  {pcb.usedIn.map((product) => (
                    <span
                      key={product}
                      className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground border border-border/60"
                    >
                      <Layers className="mr-1 h-3 w-3 text-muted-foreground" />
                      {product}
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>

            <CardFooter className="pt-4">
              <Button
                render={<Link href={`/pcb-management/structure?pcb=${pcb.id}`} />}
                className="w-full font-semibold group/btn"
                variant="secondary"
              >
                <span>View Components</span>
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
              </Button>
            </CardFooter>
          </Card>
        ))}

        {filteredPcbs.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground font-semibold bg-card border border-border rounded-xl shadow-2xs">
            No PCBs match your search or filter.
          </div>
        )}
      </div>
    </div>
  )
}
