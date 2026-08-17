"use client"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Cpu, ListTree, Nut, ArrowLeft, Layers, Landmark, Award, X, ShieldCheck, Calculator, Star, Check, AlertCircle, Truck, Table2, Download, Pencil, Trash2 } from "lucide-react"
import Link from "next/link"
import { exportToExcel } from "@/lib/export-excel"
import { useData } from "@/lib/data-provider"
import { DragScrollArea } from "@/components/ui/drag-scroll-area"
import { EditPcbModal } from "@/components/pcb/edit-pcb-modal"

interface ComponentBrand {
  id: string
  name: string
}

interface ComponentItem {
  name: string
  type: string
  qty: number
  approvedBrands?: ComponentBrand[]
  lookupId?: string
  // Extended BOM (Excel view) fields
  refDes?: string
  preferredBrand?: string
  remarks?: string
  partNumber?: string
  solderType?: "SMD" | "DIP"
  footprint?: string
  spq?: number
  unitPrice?: number
  availableQty?: number
}

interface DrawerComponentDetail {
  id: string
  name: string
  category: string
  stock: number
  minStock: number
  unit: string
  status: "Healthy" | "Low"
  description: string
  brands: { id: string; name: string; status: string }[]
  suppliers: { id: string; name: string; price: string; leadTime: string }[]
}

function PCBStructureContent() {
  const searchParams = useSearchParams()
  const pcbId = searchParams.get("pcb") || "audio-pcb"

  const {
    PCBS, getPcb, getComponent, getSupplierName, getBrandName, pcbBom, componentBrands,
    componentStockStatus, bestPrice, productsUsingPcb, formatLeadTime, reload,
  } = useData()

  const router = useRouter()
  const [buildQty, setBuildQty] = React.useState(1)
  const [selectedCompId, setSelectedCompId] = React.useState<string | null>(null)
  const [viewMode, setViewMode] = React.useState<"tree" | "excel">("tree")
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)

  const formatINR = (n: number) =>
    "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Fallback to first PCB if invalid pcbId — data comes from the central store
  const pcbEntity = getPcb(pcbId) || PCBS[0]

  // No PCBs (e.g. empty database) or an id that resolves to nothing → empty state
  // instead of crashing on pcbEntity.name.
  if (!pcbEntity) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <span>PCB Management</span>
            <span>/</span>
            <span className="text-foreground font-medium">PCB Structure</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">PCB Structure</h1>
        </div>
        <Card className="border border-border shadow-sm">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Cpu className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-bold text-foreground">No PCB to display</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                There are no PCBs in the system yet. Add a PCB to view its component structure and bill of materials.
              </p>
            </div>
            <Button variant="outline" render={<Link href="/pcb-management/list" />} className="gap-2 border-border bg-background">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to PCB List</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Build the view model (ComponentItem[]) from the linked component records
  const pcb = {
    name: pcbEntity.name,
    description: pcbEntity.description,
    componentsCount: pcbEntity.componentsCount,
    stockCount: pcbEntity.stockCount,
    usedIn: productsUsingPcb(pcbEntity.id).map((p) => p.name),
    components: pcbBom(pcbEntity).map(({ component, qty, refDes, preferredBrandId, remarks }): ComponentItem => ({
      name: component.name,
      type: component.category,
      qty,
      lookupId: component.id,
      approvedBrands: componentBrands(component).map((b) => ({ id: b.id, name: b.name })),
      refDes,
      preferredBrand: preferredBrandId ? getBrandName(preferredBrandId) : undefined,
      remarks,
      partNumber: component.brandVariants[0]?.partNo,
      solderType: component.solderType,
      footprint: component.footprint,
      spq: component.spq,
      unitPrice: bestPrice(component),
      availableQty: component.stock,
    })),
  }

  const handleComponentClick = (comp: ComponentItem) => {
    if (comp.lookupId && getComponent(comp.lookupId)) {
      setSelectedCompId(comp.lookupId)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/pcbs/${encodeURIComponent(pcbEntity.id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error?.message || `Request failed (${res.status})`)
      await reload()
      router.push("/pcb-management/list")
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete PCB")
      setIsDeleting(false)
    }
  }

  const selectedComponent = selectedCompId ? getComponent(selectedCompId) : null
  const selectedComponentDetail: DrawerComponentDetail | null = selectedComponent
    ? {
        id: selectedComponent.id,
        name: selectedComponent.name,
        category: selectedComponent.category,
        stock: selectedComponent.stock,
        minStock: selectedComponent.minStock,
        unit: selectedComponent.unit,
        status: componentStockStatus(selectedComponent) === "Healthy" ? "Healthy" : "Low",
        description: selectedComponent.description,
        brands: componentBrands(selectedComponent).map((b) => ({ id: b.id, name: b.name, status: "Approved" })),
        suppliers: selectedComponent.offers.map((o) => ({
          id: o.supplierId,
          name: getSupplierName(o.supplierId),
          price: formatINR(o.price),
          leadTime: formatLeadTime(o.leadTimeDays),
        })),
      }
    : null

  // Compute total component instances
  const totalParts = pcb.components.reduce((sum, c) => sum + c.qty, 0)

  // Excel/BOM view helpers
  const lineTotal = (c: ComponentItem) => (c.unitPrice ?? 0) * c.qty * buildQty
  const bomTotalValue = pcb.components.reduce((sum, c) => sum + lineTotal(c), 0)

  const handleExportExcel = () => {
    const scaled = buildQty > 1
    exportToExcel({
      fileName: `${pcb.name.replace(/\s+/g, "-")}-BOM${scaled ? `-x${buildQty}` : ""}`,
      sheetName: pcb.name.slice(0, 28) || "BOM",
      columns: [
        { header: "#", value: (_c, i) => i + 1, type: "Number", width: 4 },
        { header: "Ref Des", value: (c) => c.refDes ?? "", width: 14 },
        { header: "Type", value: (c) => c.type, width: 14 },
        { header: "Name", value: (c) => c.name, width: 24 },
        { header: "Preferred Brand", value: (c) => c.preferredBrand ?? "", width: 20 },
        { header: "Part Number", value: (c) => c.partNumber ?? "", width: 20 },
        { header: "Solder Type", value: (c) => c.solderType ?? "", width: 11 },
        { header: "Footprint", value: (c) => c.footprint ?? "", width: 20 },
        { header: "Qty / Board", value: (c) => c.qty, type: "Number", width: 11 },
        ...(scaled
          ? [{ header: "Qty Needed", value: (c: ComponentItem) => c.qty * buildQty, type: "Number" as const, width: 12 }]
          : []),
        { header: "SPQ", value: (c) => c.spq ?? "", type: "Number", width: 8 },
        { header: "Manufacturer", value: (c) => c.approvedBrands?.map((b) => b.name).join(", ") ?? "", width: 22 },
        { header: "Unit Price (INR)", value: (c) => c.unitPrice ?? "", type: "Number", width: 14 },
        { header: "Total Price (INR)", value: (c) => Number(lineTotal(c).toFixed(2)), type: "Number", width: 15 },
        { header: "Available Qty", value: (c) => c.availableQty ?? "", type: "Number", width: 12 },
      ],
      rows: pcb.components,
      totalsRow: [
        "",                                 // #
        "",                                 // Ref Des
        "TOTAL",                            // Type
        `${pcb.components.length} items`,    // Name
        "",                                 // Preferred Brand
        "",                                 // Part Number
        "",                                 // Solder Type
        "",                                 // Footprint
        totalParts,                         // Qty / Board
        ...(scaled ? [totalParts * buildQty] : []), // Qty Needed
        "",                                 // SPQ
        "",                                 // Manufacturer
        "",                                 // Unit Price
        Number(bomTotalValue.toFixed(2)),   // Total Price
        "",                                 // Available Qty
      ],
    })
  }

  return (
    <div className="space-y-6 relative">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <span>PCB Management</span>
            <span>/</span>
            <span className="text-foreground font-medium">PCB Structure</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">PCB Structure</h1>
          <p className="text-muted-foreground">
            Component composition, quantities, and bill of materials breakdown.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            onClick={handleExportExcel}
            variant="outline"
            className="gap-2 border-border bg-background cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>Export to Excel</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => setEditOpen(true)}
            className="gap-2 border-border bg-background cursor-pointer"
          >
            <Pencil className="h-4 w-4" />
            <span>Edit</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => setDeleteOpen(true)}
            className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive bg-background cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete</span>
          </Button>
          <Button
            variant="outline"
            render={<Link href="/pcb-management/list" />}
            className="gap-2 border-border bg-background cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to List</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Structure Panel */}
        <Card className="lg:col-span-2 border border-border shadow-sm">
          <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                {viewMode === "tree" ? (
                  <ListTree className="h-5 w-5 text-primary" />
                ) : (
                  <Table2 className="h-5 w-5 text-primary" />
                )}
                <div>
                  <CardTitle className="text-lg font-bold">
                    {viewMode === "tree" ? "PCB Item Tree" : "Bill of Materials (Excel View)"}
                  </CardTitle>
                  <CardDescription>
                    {viewMode === "tree"
                      ? `Visual breakdown of ${pcb.name} parts with quantities. Click an item to view details.`
                      : `Flat BOM sheet for ${pcb.name}. Click a row to view item details.`}
                  </CardDescription>
                </div>
              </div>

              {/* View Mode Switch */}
              <div className="inline-flex shrink-0 items-center rounded-lg border border-border bg-background p-0.5 shadow-2xs self-start">
                <button
                  onClick={() => setViewMode("tree")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                    viewMode === "tree"
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ListTree className="h-3.5 w-3.5" />
                  <span>Tree</span>
                </button>
                <button
                  onClick={() => setViewMode("excel")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                    viewMode === "excel"
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Table2 className="h-3.5 w-3.5" />
                  <span>Excel</span>
                </button>
              </div>
            </div>
          </CardHeader>

          {/* ===== TREE VIEW ===== */}
          {viewMode === "tree" && (
          <CardContent className="p-0">
          <DragScrollArea className="p-6 md:p-8 overflow-x-auto">
            {/* Root Node */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 p-3 rounded-lg w-fit shadow-xs">
                <Cpu className="h-5 w-5 text-primary" />
                <span className="font-extrabold text-primary text-sm uppercase tracking-wider">{pcb.name}</span>
                {buildQty > 1 && (
                  <span className="text-xs font-bold text-amber-600 bg-amber-500/10 px-2.5 py-0.5 rounded-full">
                    Build Qty: {buildQty.toLocaleString()} units
                  </span>
                )}
              </div>

              {/* Children Component Nodes */}
              <div className="relative pl-6 space-y-5 before:absolute before:left-3.5 before:top-0 before:bottom-6 before:w-[2px] before:border-l-2 before:border-dashed before:border-border">
                {pcb.components.map((component) => {
                  const isClickable = !!component.lookupId && !!getComponent(component.lookupId)
                  return (
                    <div key={component.name} className="relative flex items-start gap-3.5 group">
                      {/* Connection Line */}
                      <div className="absolute -left-6 top-4.5 w-6 h-[2px] border-t-2 border-dashed border-border group-hover:border-primary/50 transition-colors" />
                      
                      <div className="flex flex-col gap-1.5 w-full max-w-lg">
                        {/* Component Card */}
                        <div 
                          onClick={() => isClickable && handleComponentClick(component)}
                          className={`flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-lg text-xs font-semibold text-foreground transition-all shadow-2xs relative z-10 w-fit select-none ${
                            isClickable
                              ? "cursor-pointer hover:border-primary/60 hover:shadow-xs group-hover:border-primary/50"
                              : ""
                          }`}
                        >
                          <Nut className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                          {component.refDes && (
                            <span className="font-mono text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
                              {component.refDes}
                            </span>
                          )}
                          <span>{component.name}</span>
                          {/* Quantity badge */}
                          <span className="font-mono text-primary font-bold ml-1 text-[11px]">
                            × {component.qty}
                          </span>
                          {buildQty > 1 && (
                            <span className="font-mono text-amber-600 dark:text-amber-500 font-bold ml-1 text-[11px] bg-amber-500/10 px-1 rounded">
                              ({(component.qty * buildQty).toLocaleString()} req.)
                            </span>
                          )}
                          <span className="text-[10px] uppercase font-bold text-muted-foreground/45 bg-muted px-1.5 py-0.5 rounded ml-2 font-mono">
                            {component.type}
                          </span>
                        </div>

                        {/* Approved Brands Leaf Node */}
                        {component.approvedBrands && component.approvedBrands.length > 0 && (
                          <div className="pl-6 flex flex-col gap-1 text-[11px] text-muted-foreground border-l border-dashed border-border/80 ml-3.5 py-0.5 animate-in fade-in duration-300">
                            <span className="font-semibold text-[10px] uppercase text-muted-foreground/50 tracking-wider flex items-center gap-1">
                              Approved Manufacturers:
                              <span className="text-primary font-extrabold">{component.approvedBrands.length}</span>
                            </span>
                            <div className="flex flex-wrap gap-1.5 mt-0.5">
                              {component.approvedBrands.map(b => (
                                <Link 
                                  key={b.id}
                                  href={`/brands/list?brand=${b.id}`}
                                  className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 font-bold text-secondary-foreground hover:text-primary hover:bg-primary/5 border border-border transition-colors cursor-pointer"
                                >
                                  <Award className="h-3 w-3 text-primary" />
                                  <span>{b.name}</span>
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </DragScrollArea>
          </CardContent>
          )}

          {/* ===== EXCEL / BOM VIEW ===== */}
          {viewMode === "excel" && (
          <CardContent className="p-0">
            <DragScrollArea className="overflow-x-auto">
              <table className="w-full text-left text-xs text-foreground whitespace-nowrap">
                <thead className="bg-muted/40 text-muted-foreground border-b border-border text-[10px] uppercase font-bold sticky top-0">
                  <tr>
                    <th scope="col" className="px-3 py-3 text-center w-10">#</th>
                    <th scope="col" className="px-3 py-3">Ref Des</th>
                    <th scope="col" className="px-3 py-3">Type</th>
                    <th scope="col" className="px-3 py-3 min-w-[140px]">Name</th>
                    <th scope="col" className="px-3 py-3">Part Number</th>
                    <th scope="col" className="px-3 py-3 text-center">Solder Type</th>
                    <th scope="col" className="px-3 py-3">Footprint</th>
                    <th scope="col" className="px-3 py-3 text-center">Qty</th>
                    {buildQty > 1 && (
                      <th scope="col" className="px-3 py-3 text-center">Qty Needed</th>
                    )}
                    <th scope="col" className="px-3 py-3 text-center">SPQ</th>
                    <th scope="col" className="px-3 py-3">Manufacturer</th>
                    <th scope="col" className="px-3 py-3 text-right">Unit Price</th>
                    <th scope="col" className="px-3 py-3 text-right">Total Price</th>
                    <th scope="col" className="px-3 py-3 text-right">Available Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pcb.components.map((c, idx) => {
                    const isClickable = !!c.lookupId && !!getComponent(c.lookupId)
                    const qtyNeeded = c.qty * buildQty
                    const shortage = c.availableQty !== undefined && c.availableQty < qtyNeeded
                    return (
                      <tr
                        key={c.name}
                        onClick={() => isClickable && handleComponentClick(c)}
                        className={`transition-colors ${
                          isClickable ? "cursor-pointer hover:bg-muted/30" : "hover:bg-muted/10"
                        }`}
                      >
                        <td className="px-3 py-2.5 text-center font-mono text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-2.5 font-mono text-[11px] font-bold text-primary">
                          {c.refDes ?? "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground font-mono">
                            {c.type}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-foreground">
                          <div className="flex items-center gap-2">
                            <Nut className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span>{c.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-muted-foreground">{c.partNumber ?? "—"}</td>
                        <td className="px-3 py-2.5 text-center">
                          {c.solderType ? (
                            <span className="font-mono text-[10px] font-bold text-foreground">{c.solderType}</span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-muted-foreground">{c.footprint ?? "—"}</td>
                        <td className="px-3 py-2.5 text-center font-mono font-bold text-primary">{c.qty}</td>
                        {buildQty > 1 && (
                          <td className="px-3 py-2.5 text-center font-mono font-bold text-amber-600">
                            {qtyNeeded.toLocaleString()}
                          </td>
                        )}
                        <td className="px-3 py-2.5 text-center font-mono text-muted-foreground">
                          {c.spq?.toLocaleString() ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {c.approvedBrands && c.approvedBrands.length > 0 ? (
                            <span className="font-semibold text-foreground">
                              {c.approvedBrands[0].name}
                              {c.approvedBrands.length > 1 && (
                                <span className="text-muted-foreground font-mono"> +{c.approvedBrands.length - 1}</span>
                              )}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-foreground">
                          {c.unitPrice !== undefined ? formatINR(c.unitPrice) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-foreground">
                          {c.unitPrice !== undefined ? formatINR(lineTotal(c)) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {c.availableQty !== undefined ? (
                            <span className={`font-mono font-bold ${shortage ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                              {c.availableQty.toLocaleString()}
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    )
                  })}
                  {/* Totals Row */}
                  <tr className="bg-muted/40 font-bold border-t-2 border-border">
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3 uppercase text-[10px] tracking-wider text-muted-foreground" colSpan={6}>
                      Total — {pcb.components.length} line items
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-primary">{totalParts}</td>
                    {buildQty > 1 && (
                      <td className="px-3 py-3 text-center font-mono text-amber-600">
                        {(totalParts * buildQty).toLocaleString()}
                      </td>
                    )}
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3 text-right font-mono text-foreground">{formatINR(bomTotalValue)}</td>
                    <td className="px-3 py-3" />
                  </tr>
                </tbody>
              </table>
            </DragScrollArea>

            {/* Excel view footer actions */}
            <div className="flex items-center justify-between border-t border-border bg-muted/10 px-6 py-3">
              <span className="text-xs text-muted-foreground font-medium">
                Estimated BOM cost{buildQty > 1 ? ` for ${buildQty.toLocaleString()} units` : " per board"}:{" "}
                <span className="font-mono font-bold text-foreground">{formatINR(bomTotalValue)}</span>
              </span>
              <Button onClick={handleExportExcel} variant="outline" size="sm" className="gap-2 font-semibold border-border cursor-pointer">
                <Download className="h-4 w-4" />
                <span>Export to Excel</span>
              </Button>
            </div>
          </CardContent>
          )}
        </Card>

        {/* Right Summary + Calculator Panel */}
        <div className="space-y-6">
          {/* Summary Card */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg font-bold">PCB Summary</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">PCB Name</span>
                  <span className="text-xl font-extrabold text-foreground">{pcb.name}</span>
                </div>

                <div className="flex flex-col gap-1 border-t border-border/50 pt-3">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Description</span>
                  <span className="text-sm text-muted-foreground leading-normal">{pcb.description}</span>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-border/50 pt-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Unique Items</span>
                    <span className="font-bold text-foreground text-sm">{pcb.components.length}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Total Parts</span>
                    <span className="font-bold text-foreground text-sm">{totalParts}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-border/50 pt-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">PCB Stock</span>
                    <span className="font-bold text-foreground text-sm">{pcb.stockCount} Units</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">BOM Lines</span>
                    <span className="font-bold text-foreground text-sm">{pcb.componentsCount}</span>
                  </div>
                </div>

                <div className="space-y-2 border-t border-border/50 pt-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 block">Used In Products</span>
                  <div className="flex flex-wrap gap-1.5">
                    {pcb.usedIn.map((product) => (
                      <span 
                        key={product} 
                        className="inline-flex items-center rounded-md bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground border border-border"
                      >
                        <Landmark className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
                        {product}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* BOM Quantity Table */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
              <div className="flex items-center gap-2">
                <Nut className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg font-bold">Bill of Materials</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border-border overflow-hidden text-xs">
                <table className="w-full text-left text-foreground">
                  <thead className="bg-muted/40 text-muted-foreground border-b border-border text-[10px] uppercase font-semibold">
                    <tr>
                      <th scope="col" className="px-4 py-2.5">Item</th>
                      <th scope="col" className="px-4 py-2.5 text-center">Qty / PCB</th>
                      {buildQty > 1 && (
                        <th scope="col" className="px-4 py-2.5 text-right">Total Req.</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pcb.components.map((c) => (
                      <tr key={c.name} className="hover:bg-muted/5">
                        <td className="px-4 py-2.5 font-semibold">{c.name}</td>
                        <td className="px-4 py-2.5 text-center font-mono font-bold text-primary">{c.qty}</td>
                        {buildQty > 1 && (
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-600">
                            {(c.qty * buildQty).toLocaleString()}
                          </td>
                        )}
                      </tr>
                    ))}
                    <tr className="bg-muted/30 font-bold">
                      <td className="px-4 py-2.5 uppercase text-[10px] tracking-wider text-muted-foreground">Total</td>
                      <td className="px-4 py-2.5 text-center font-mono text-primary">{totalParts}</td>
                      {buildQty > 1 && (
                        <td className="px-4 py-2.5 text-right font-mono text-amber-600">
                          {(totalParts * buildQty).toLocaleString()}
                        </td>
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Build Calculator */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg font-bold">Build Calculator</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">PCB Build Target Quantity</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={buildQty}
                    onChange={(e) => {
                      const val = parseInt(e.target.value)
                      setBuildQty(isNaN(val) || val < 1 ? 1 : val)
                    }}
                    className="bg-background border-border font-mono font-bold text-primary"
                  />
                  <span className="text-sm font-semibold text-muted-foreground">Units</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-normal mt-1">
                  Set target build quantity to scale all component requirements across the BOM.
                </p>
              </div>

              {buildQty > 1 && (
                <div className="bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/10 dark:border-amber-500/20 rounded-lg p-3 space-y-2">
                  <span className="text-[10px] uppercase font-bold text-amber-600 block">Scaled Requirement:</span>
                  <div className="text-xs font-semibold text-muted-foreground">
                    {pcb.components[0]?.name}: <span className="font-mono text-foreground font-bold">{pcb.components[0]?.qty}</span> × <span className="font-mono text-foreground font-bold">{buildQty.toLocaleString()}</span> = <span className="font-mono text-amber-600 font-bold">{((pcb.components[0]?.qty || 0) * buildQty).toLocaleString()} required</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ===== Component Details Slide-out Drawer ===== */}
      {selectedComponentDetail && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200"
          onClick={() => setSelectedCompId(null)}
        >
          <div 
            className="w-full max-w-md bg-card border-l border-border h-full p-6 shadow-2xl overflow-y-auto flex flex-col gap-6 animate-in slide-in-from-right duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <Nut className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-bold text-foreground">Item Details</h3>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-full border-0 bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setSelectedCompId(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Component Metadata Section */}
            <div className="space-y-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider">Name</span>
                <h4 className="text-xl font-extrabold text-foreground">{selectedComponentDetail.name}</h4>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider">Category</span>
                  <p className="text-sm font-semibold text-foreground">{selectedComponentDetail.category}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider">Unit</span>
                  <p className="text-sm font-semibold text-foreground">{selectedComponentDetail.unit}</p>
                </div>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider">Description</span>
                <p className="text-xs text-muted-foreground leading-relaxed bg-muted/30 border border-border/50 p-2.5 rounded-lg mt-0.5">
                  {selectedComponentDetail.description}
                </p>
              </div>
            </div>

            {/* Inventory Status Summary */}
            <div className="bg-secondary/30 border border-border/50 p-4 rounded-xl space-y-3">
              <div className="flex justify-between items-baseline">
                <span className="text-xs uppercase font-bold text-muted-foreground">Current Inventory Stock</span>
                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${
                  selectedComponentDetail.status === "Healthy"
                    ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20"
                    : "bg-destructive/10 text-destructive dark:bg-destructive/20"
                }`}>
                  {selectedComponentDetail.status}
                </span>
              </div>
              <div className="text-3xl font-black text-foreground tracking-tight">
                {selectedComponentDetail.stock.toLocaleString()} <span className="text-xs text-muted-foreground font-semibold">PCS</span>
              </div>
              <div className="border-t border-border/50 pt-2 text-[11px] text-muted-foreground flex justify-between">
                <span>Minimum Safety Threshold:</span>
                <span className="font-mono font-bold text-foreground">{selectedComponentDetail.minStock.toLocaleString()} PCS</span>
              </div>
            </div>

            {/* Approved Manufacturer Brands Section */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span className="text-xs uppercase font-bold text-muted-foreground/70 tracking-wider">Approved Manufacturers ({selectedComponentDetail.brands.length})</span>
              </div>
              <div className="border border-border rounded-lg overflow-hidden text-xs">
                <table className="w-full text-left text-foreground">
                  <thead className="bg-muted/40 text-muted-foreground border-b border-border text-[10px] uppercase font-semibold">
                    <tr>
                      <th scope="col" className="px-4 py-2">Manufacturer</th>
                      <th scope="col" className="px-4 py-2 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selectedComponentDetail.brands.map((b) => (
                      <tr key={b.id} className="hover:bg-muted/5">
                        <td className="px-4 py-2.5">
                          <Link 
                            href={`/brands/list?brand=${b.id}`}
                            className="font-bold text-primary hover:underline"
                            onClick={() => setSelectedCompId(null)}
                          >
                            {b.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                            {b.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Supplier Price Matrix Section */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5">
                <Truck className="h-4 w-4 text-primary" />
                <span className="text-xs uppercase font-bold text-muted-foreground/70 tracking-wider">Supplier Agreements</span>
              </div>
              <div className="border border-border rounded-lg overflow-hidden text-xs">
                <table className="w-full text-left text-foreground">
                  <thead className="bg-muted/40 text-muted-foreground border-b border-border text-[10px] uppercase font-semibold">
                    <tr>
                      <th scope="col" className="px-4 py-2">Distributor</th>
                      <th scope="col" className="px-4 py-2">Price</th>
                      <th scope="col" className="px-4 py-2 text-right">Lead Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selectedComponentDetail.suppliers.map((s, idx) => (
                      <tr key={idx} className="hover:bg-muted/5">
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/suppliers/details?supplier=${s.id}`}
                            className="font-bold text-muted-foreground hover:text-foreground hover:underline"
                            onClick={() => setSelectedCompId(null)}
                          >
                            {s.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-primary">{s.price}</td>
                        <td className="px-4 py-2.5 font-mono text-right text-muted-foreground">{s.leadTime}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Link to Full Component Page */}
            <div className="border-t border-border/50 pt-4 flex">
              <Button 
                className="w-full font-bold gap-2 justify-center" 
                variant="outline"
                render={<Link href={`/components/details?component=${selectedComponentDetail.id}`} />}
                onClick={() => setSelectedCompId(null)}
              >
                <span>Open Full Item Dashboard</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete PCB — confirmation */}
      {deleteOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !isDeleting && setDeleteOpen(false)}
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
                onClick={() => setDeleteOpen(false)}
                disabled={isDeleting}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-xs font-semibold leading-relaxed text-destructive">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p>
                  Deleting <strong>{pcb.name}</strong> removes it from the PCB list. A PCB used by any product cannot be
                  deleted.
                </p>
              </div>
              <p className="text-sm font-semibold text-foreground/80">Are you sure you want to delete this PCB?</p>
              <div className="flex items-center justify-end gap-3 border-t border-border/50 pt-4">
                <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={isDeleting}>
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

      {/* Edit PCB — modal dialog */}
      {editOpen && (
        <EditPcbModal pcbId={pcbEntity.id} onClose={() => setEditOpen(false)} />
      )}
    </div>
  )
}

export default function PCBStructurePage() {
  return (
    <React.Suspense fallback={
      <div className="flex h-[400px] items-center justify-center text-muted-foreground text-sm font-medium">
        Loading PCB details...
      </div>
    }>
      <PCBStructureContent />
    </React.Suspense>
  )
}
