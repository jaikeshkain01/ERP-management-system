"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Cpu, Nut, Plus, Search, Layers, ArrowRight,
  CircuitBoard, Boxes, CheckCircle2, FlaskConical,
  Archive, RefreshCw, Pencil, Trash2, AlertCircle, X
} from "lucide-react"
import { StatStrip } from "@/components/stat-strip"
import { useData } from "@/lib/data-provider"
import type { PcbStatus } from "@/lib/catalog"
import { AddPcbModal, type ManualPcbData } from "@/components/pcb/add-pcb-modal"
import { EditPcbModal } from "@/components/pcb/edit-pcb-modal"

const STATUS_STYLES: Record<PcbStatus, { label: string; className: string; icon: React.ElementType }> = {
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
  const d = useData()
  const { PCBS, pcbUsedInLabels } = d
  const router = useRouter()
  const [searchQuery, setSearchQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("All")
  const [isManualOpen, setIsManualOpen] = React.useState(false)
  /** PCB id being edited (opens the edit modal), or null. */
  const [editTarget, setEditTarget] = React.useState<string | null>(null)
  /** PCB pending soft-delete (confirmation modal), or null. */
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  const handleResetFilters = () => {
    setSearchQuery("")
    setStatusFilter("All")
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/pcbs/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error?.message || `Request failed (${res.status})`)
      setDeleteTarget(null)
      await d.reload() // drop the deleted PCB from the list
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete PCB")
    } finally {
      setIsDeleting(false)
    }
  }

  const handleApplyManual = async (data: ManualPcbData) => {
    try {
      const res = await fetch("/api/pcbs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: data.name,
          description: data.description || undefined,
          layers: data.layers,
          status: data.status,
          lines: data.lines.map((l) => ({
            componentId: l.componentId,
            name: l.name || undefined,
            partNumber: l.partNumber || undefined,
            type: l.type || undefined,
            solderType: l.solderType === "SMD" || l.solderType === "DIP" ? l.solderType : undefined,
            footprint: l.footprint || undefined,
            qty: l.qty,
          })),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error?.message || `Request failed (${res.status})`)
      const createdPcb = body.data as { slug: string }
      setIsManualOpen(false)
      await d.reload() // refetch the catalog so the new PCB appears in the list
      router.push(`/pcb-management/structure?pcb=${createdPcb.slug}`)
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : "Failed to save PCB")
    }
  }

  const filteredPcbs = PCBS.filter((pcb) => {
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase()
      const matchesSearch =
        pcb.name.toLowerCase().includes(q) ||
        pcb.description.toLowerCase().includes(q) ||
        pcbUsedInLabels(pcb.id).some((p) => p.toLowerCase().includes(q))
      if (!matchesSearch) return false
    }
    if (statusFilter !== "All" && pcb.status !== statusFilter) return false
    return true
  })

  // Summary metrics (computed across the full dataset)
  const totalPcbs = PCBS.length
  const totalComponents = PCBS.reduce((sum, pcb) => sum + pcb.componentsCount, 0)
  const activeCount = PCBS.filter((pcb) => pcb.status === "Active").length

  const renderStatusBadge = (status: PcbStatus) => {
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

        <Button
          onClick={() => setIsManualOpen(true)}
          className="gap-2 font-semibold self-start md:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>Add PCB</span>
        </Button>
      </div>

      {/* Summary — instrument readout strip */}
      <StatStrip
        items={[
          { label: "Total PCBs", value: totalPcbs, icon: CircuitBoard },
          { label: "Total Items", value: totalComponents, icon: Boxes },
          { label: "Active Boards", value: activeCount, desc: "Released to production", icon: CheckCircle2, tone: "success" },
        ]}
      />

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
                    <span className="text-[10px] uppercase font-bold text-muted-foreground leading-none">Items</span>
                    <span className="text-sm font-black mt-1 text-foreground">{pcb.componentsCount}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground border border-border/60">
                    <Layers className="h-4 w-4 text-primary" />
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
                  {pcbUsedInLabels(pcb.id).map((product) => (
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

            <CardFooter className="pt-4 gap-2">
              <Button
                render={<Link href={`/pcb-management/structure?pcb=${pcb.id}`} />}
                className="flex-1 font-semibold group/btn"
                variant="secondary"
              >
                <span>View Items</span>
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setEditTarget(pcb.id)}
                className="shrink-0 border-border"
                aria-label={`Edit ${pcb.name}`}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setDeleteTarget({ id: pcb.id, name: pcb.name })}
                className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
                aria-label={`Delete ${pcb.name}`}
              >
                <Trash2 className="h-4 w-4" />
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

      {/* Add PCB — manual entry */}
      {isManualOpen && (
        <AddPcbModal
          onApply={handleApplyManual}
          onClose={() => setIsManualOpen(false)}
        />
      )}

      {/* Edit PCB — modal dialog */}
      {editTarget && (
        <EditPcbModal pcbId={editTarget} onClose={() => setEditTarget(null)} />
      )}

      {/* Delete PCB — confirmation */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !isDeleting && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border bg-muted/20 px-6 py-4">
              <h3 className="text-lg font-bold text-foreground">Delete PCB</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-xs font-semibold leading-relaxed text-destructive">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p>
                  Deleting <strong>{deleteTarget.name}</strong> removes it from the PCB list. A PCB used by any product
                  cannot be deleted.
                </p>
              </div>
              <p className="text-sm font-semibold text-foreground/80">Are you sure you want to delete this PCB?</p>
              <div className="flex items-center justify-end gap-3 border-t border-border/50 pt-4">
                <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
                  Cancel
                </Button>
                <Button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold"
                >
                  {isDeleting ? "Deleting..." : "Delete PCB"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
