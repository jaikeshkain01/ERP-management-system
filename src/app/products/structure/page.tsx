"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Cpu, ListTree, Nut, Package, ArrowLeft, Layers, Truck, Calculator, X, Award, ShieldCheck, Landmark, Star, Check, AlertCircle, Table2, Download } from "lucide-react"
import Link from "next/link"
import { exportToExcel } from "@/lib/export-excel"
import { useData } from "@/lib/data-provider"
import type { Component as MComponent } from "@/mockdata"

interface ComponentItem {
  name: string
  type: string
  suppliers: string[]
  qty: number
  brandsCount?: number
  lookupId?: string
}

interface PCBItem {
  name: string
  qty: number
  components: ComponentItem[]
}

interface ProductData {
  name: string
  code: string
  version: string
  pcbsCount: number
  uniqueComponentsCount: number
  totalComponentsCount: number
  estimatedCost: string
  description: string
  structure: PCBItem[]
}

interface DrawerComponentDetail {
  id: string
  name: string
  category: string
  genericPN: string
  stock: number
  minStock: number
  unit: string
  status: "Healthy" | "Low"
  description: string
  brands: { id: string; name: string; status: string }[]
  suppliers: { id: string; name: string; price: string; leadTime: string }[]
}

function ProductStructureContent() {
  const searchParams = useSearchParams()
  const productId = searchParams.get("product") || "roip-400"

  const {
    PRODUCTS, getProduct, getComponent, getSupplierName, productPcbList, pcbBom,
    componentBrands, componentStockStatus, bestPrice, productUniqueComponents,
    productTotalParts, formatINR: fmtINR, formatLeadTime,
  } = useData()

  const [buildQty, setBuildQty] = React.useState(1)
  const [selectedCompId, setSelectedCompId] = React.useState<string | null>(null)
  const [expandedComponents, setExpandedComponents] = React.useState<Record<string, boolean>>({})
  const [viewMode, setViewMode] = React.useState<"tree" | "excel">("tree")

  const formatINR = (n: number) =>
    "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Default to first product if id is invalid — data from the central store
  const productEntity = getProduct(productId) || PRODUCTS[0]

  // Build a Component → DrawerComponentDetail view from a canonical component
  const toDrawerDetail = (component: MComponent): DrawerComponentDetail => ({
    id: component.id,
    name: component.name,
    category: component.category,
    genericPN: component.genericPN,
    stock: component.stock,
    minStock: component.minStock,
    unit: component.unit,
    status: componentStockStatus(component) === "Healthy" ? "Healthy" : "Low",
    description: component.description,
    brands: componentBrands(component).map((b) => ({ id: b.id, name: b.name, status: "Approved" })),
    suppliers: component.offers.map((o) => ({
      id: o.supplierId,
      name: getSupplierName(o.supplierId),
      price: fmtINR(o.price),
      leadTime: formatLeadTime(o.leadTimeDays),
    })),
  })

  // Assembly tree view model (product → PCB → component)
  const product: ProductData = {
    name: productEntity.name,
    code: productEntity.code,
    version: productEntity.version,
    pcbsCount: productEntity.pcbs.length,
    uniqueComponentsCount: productUniqueComponents(productEntity).length,
    totalComponentsCount: productTotalParts(productEntity),
    estimatedCost: formatINR(productEntity.estimatedCost).replace(/\.00$/, ""),
    description: productEntity.description,
    // Component qty is per finished unit = per-board qty × boards per unit (pcb qty).
    structure: productPcbList(productEntity).map(({ pcb, qty: pcbQty }): PCBItem => ({
      name: pcb.name,
      qty: pcbQty,
      components: pcbBom(pcb).map(({ component, qty }): ComponentItem => ({
        name: component.name,
        type: component.category,
        suppliers: component.offers.map((o) => getSupplierName(o.supplierId)),
        qty: qty * pcbQty,
        brandsCount: componentBrands(component).length,
        lookupId: component.id,
      })),
    })),
  }

  const handleComponentClick = (comp: ComponentItem) => {
    if (comp.lookupId && getComponent(comp.lookupId)) {
      setSelectedCompId(comp.lookupId)
    }
  }

  // ----- Excel / BOM view helpers -----
  const detailOf = (c: ComponentItem): DrawerComponentDetail | undefined => {
    const comp = c.lookupId ? getComponent(c.lookupId) : undefined
    return comp ? toDrawerDetail(comp) : undefined
  }
  const unitPriceOf = (c: ComponentItem) => {
    const comp = c.lookupId ? getComponent(c.lookupId) : undefined
    return comp ? bestPrice(comp) : 0
  }

  // Flattened BOM (product → PCB → component)
  const bomRows = product.structure.flatMap((pcb) =>
    pcb.components.map((comp) => ({ pcb: pcb.name, comp })),
  )
  const totalParts = bomRows.reduce((sum, r) => sum + r.comp.qty, 0)
  const lineTotal = (c: ComponentItem) => unitPriceOf(c) * c.qty * buildQty
  const bomTotalValue = bomRows.reduce((sum, r) => sum + lineTotal(r.comp), 0)

  const handleExportExcel = () => {
    const scaled = buildQty > 1
    exportToExcel({
      fileName: `${product.code}-BOM${scaled ? `-x${buildQty}` : ""}`,
      sheetName: product.name.slice(0, 28) || "BOM",
      columns: [
        { header: "#", value: (_r, i) => i + 1, type: "Number", width: 4 },
        { header: "PCB", value: (r) => r.pcb, width: 16 },
        { header: "Type", value: (r) => r.comp.type, width: 14 },
        { header: "Name", value: (r) => r.comp.name, width: 22 },
        { header: "Generic PN", value: (r) => detailOf(r.comp)?.genericPN ?? "", width: 14 },
        { header: "Category", value: (r) => detailOf(r.comp)?.category ?? "", width: 14 },
        { header: "Qty / Unit", value: (r) => r.comp.qty, type: "Number", width: 10 },
        ...(scaled
          ? [{ header: "Qty Needed", value: (r: { comp: ComponentItem }) => r.comp.qty * buildQty, type: "Number" as const, width: 12 }]
          : []),
        { header: "Approved Brands", value: (r) => detailOf(r.comp)?.brands.map((b) => b.name).join(", ") ?? "", width: 26 },
        { header: "Stock", value: (r) => detailOf(r.comp)?.stock ?? "", type: "Number", width: 10 },
        { header: "Unit Price (INR)", value: (r) => unitPriceOf(r.comp) || "", type: "Number", width: 14 },
        { header: "Total Price (INR)", value: (r) => Number(lineTotal(r.comp).toFixed(2)), type: "Number", width: 15 },
      ],
      rows: bomRows,
      totalsRow: [
        "",
        "TOTAL",
        `${bomRows.length} items`,
        "",
        "",
        "",
        totalParts,
        ...(scaled ? [totalParts * buildQty] : []),
        "",
        "",
        "",
        Number(bomTotalValue.toFixed(2)),
      ],
    })
  }

  const toggleComponentExpand = (key: string) => {
    setExpandedComponents(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  const selectedComp = selectedCompId ? getComponent(selectedCompId) : null
  const selectedComponentDetail = selectedComp ? toDrawerDetail(selectedComp) : null

  return (
    <div className="space-y-6 relative">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <span>Products</span>
            <span>/</span>
            <span className="text-foreground font-medium">Product Structure</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Product Structure</h1>
          <p className="text-muted-foreground">
            BOM hierarchy mapping and assembly layout tree.
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
            render={<Link href="/products/list" />}
            className="gap-2 border-border bg-background cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to List</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Structure Panel (Hero) */}
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
                    {viewMode === "tree" ? "Assembly Tree" : "Bill of Materials (Excel View)"}
                  </CardTitle>
                  <CardDescription>
                    {viewMode === "tree"
                      ? `Visual breakdown of ${product.name} components. Click on a component to view specifications.`
                      : `Flat BOM sheet for ${product.name} across all PCBs. Click a row to view details.`}
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
          <CardContent className="p-6 md:p-8 overflow-x-auto">
            {/* Root Product Node */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 p-3 rounded-lg w-fit shadow-xs">
                <Package className="h-5 w-5 text-primary" />
                <span className="font-extrabold text-primary text-sm uppercase tracking-wider">{product.name}</span>
                {buildQty > 1 && (
                  <span className="text-xs font-bold text-amber-600 bg-amber-500/10 px-2.5 py-0.5 rounded-full">
                    Build Qty: {buildQty.toLocaleString()} units
                  </span>
                )}
              </div>

              {/* PCBs List */}
              <div className="relative pl-6 space-y-8 before:absolute before:left-3.5 before:top-0 before:bottom-3 before:w-[2px] before:bg-border/60">
                {product.structure.map((pcb) => (
                  <div key={pcb.name} className="relative">
                    {/* PCB Node Connector Line */}
                    <div className="absolute -left-6 top-5 w-6 h-[2px] bg-border/60" />
                    
                    {/* PCB Node Card */}
                    <div className="flex items-center gap-3 bg-secondary/80 border border-border p-3 rounded-lg w-fit shadow-xs relative z-10">
                      <Cpu className="h-4 w-4 text-foreground/80" />
                      <span className="font-bold text-foreground text-sm">{pcb.name}</span>
                      {pcb.qty > 1 && (
                        <span className="font-mono text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
                          × {pcb.qty}
                        </span>
                      )}
                    </div>

                    {/* PCB Child Component Nodes */}
                    {pcb.components && pcb.components.length > 0 && (
                      <div className="relative pl-8 mt-2 space-y-5 before:absolute before:left-3.5 before:top-0 before:bottom-3 before:w-[2px] before:border-l-2 before:border-dashed before:border-border">
                        {pcb.components.map((component, compIdx) => {
                          const isClickable = !!component.lookupId && !!getComponent(component.lookupId)
                          const detail = detailOf(component) ?? null
                          
                          const toggleKey = `${pcb.name}-${component.lookupId || compIdx}`
                          const isExpanded = !!expandedComponents[toggleKey]

                          return (
                            <div key={compIdx} className="relative">
                              {/* Component Node Row */}
                              <div className="relative flex items-start gap-3.5 group">
                                {/* Component Node Connector Line */}
                                <div className="absolute -left-8 top-5 w-8 h-[2px] border-t-2 border-dashed border-border group-hover:border-primary/50 transition-colors" />
                                
                                <div className="flex flex-col gap-1.5 w-full max-w-sm bg-background border border-border/80 rounded-xl p-3.5 relative z-10 shadow-2xs hover:border-primary/40 transition-all">
                                  {/* Component Name and Qty Row */}
                                  <div className="flex items-center justify-between">
                                    <div 
                                      onClick={() => isClickable && handleComponentClick(component)}
                                      className={`flex items-center gap-1.5 font-bold text-foreground text-xs ${isClickable ? "cursor-pointer hover:text-primary transition-colors" : ""}`}
                                    >
                                      <Nut className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                                      <span>{component.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 font-mono text-xs">
                                      <span className="text-primary font-bold">× {component.qty}</span>
                                      {buildQty > 1 && (
                                        <span className="text-amber-600 dark:text-amber-500 font-medium">
                                          ({(component.qty * buildQty).toLocaleString()} req.)
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Technical Details: Generic PN & Category */}
                                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-border/40 text-[10px]">
                                    <div className="flex flex-col">
                                      <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">Generic PN</span>
                                      <span className="font-mono font-bold text-primary">{detail ? detail.genericPN : (component.lookupId?.toUpperCase() || "N/A")}</span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                      <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">Approved Brands</span>
                                      <span className="font-extrabold text-foreground">{detail ? detail.brands.length : (component.brandsCount || 0)}</span>
                                    </div>
                                  </div>

                                  {/* Expand Brands Section */}
                                  {detail && detail.brands && detail.brands.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-border/40">
                                      <button
                                        type="button"
                                        onClick={() => toggleComponentExpand(toggleKey)}
                                        className="flex items-center gap-1 text-[9px] uppercase font-bold text-muted-foreground/70 hover:text-primary transition-colors"
                                      >
                                        <span>Approved Brands</span>
                                        <span className="font-mono text-[10px]">{isExpanded ? "▲" : "▼"}</span>
                                      </button>
                                      
                                      {isExpanded && (
                                        <div className="mt-2 pl-2.5 space-y-1 border-l-2 border-primary/20 animate-in slide-in-from-top-1 duration-200">
                                          {detail.brands.map((brand) => (
                                            <div key={brand.id} className="flex items-center justify-between text-[11px] py-0.5">
                                              <span className="font-semibold text-foreground/80">{brand.name}</span>
                                              <span className="inline-flex items-center rounded bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 text-[8px] font-bold text-emerald-600 dark:text-emerald-400">
                                                {brand.status}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
          )}

          {/* ===== EXCEL / BOM VIEW ===== */}
          {viewMode === "excel" && (
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-foreground whitespace-nowrap">
                <thead className="bg-muted/40 text-muted-foreground border-b border-border text-[10px] uppercase font-bold">
                  <tr>
                    <th scope="col" className="px-3 py-3 text-center w-10">#</th>
                    <th scope="col" className="px-3 py-3">PCB</th>
                    <th scope="col" className="px-3 py-3">Type</th>
                    <th scope="col" className="px-3 py-3 min-w-[140px]">Name</th>
                    <th scope="col" className="px-3 py-3">Generic PN</th>
                    <th scope="col" className="px-3 py-3">Category</th>
                    <th scope="col" className="px-3 py-3 text-center">Qty</th>
                    {buildQty > 1 && (
                      <th scope="col" className="px-3 py-3 text-center">Qty Needed</th>
                    )}
                    <th scope="col" className="px-3 py-3 text-center">Brands</th>
                    <th scope="col" className="px-3 py-3 text-right">Stock</th>
                    <th scope="col" className="px-3 py-3 text-right">Unit Price</th>
                    <th scope="col" className="px-3 py-3 text-right">Total Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bomRows.map((r, idx) => {
                    const c = r.comp
                    const detail = detailOf(c)
                    const isClickable = !!c.lookupId && !!detail
                    const qtyNeeded = c.qty * buildQty
                    const price = unitPriceOf(c)
                    // Group separator: show PCB name boldly only on first row of each PCB
                    const isFirstOfPcb = idx === 0 || bomRows[idx - 1].pcb !== r.pcb
                    return (
                      <tr
                        key={`${r.pcb}-${c.name}-${idx}`}
                        onClick={() => isClickable && handleComponentClick(c)}
                        className={`transition-colors ${
                          isClickable ? "cursor-pointer hover:bg-muted/30" : "hover:bg-muted/10"
                        }`}
                      >
                        <td className="px-3 py-2.5 text-center font-mono text-muted-foreground">{idx + 1}</td>
                        <td className="px-3 py-2.5">
                          {isFirstOfPcb ? (
                            <span className="inline-flex items-center gap-1.5 font-bold text-foreground">
                              <Cpu className="h-3.5 w-3.5 text-primary shrink-0" />
                              {r.pcb}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 pl-5">↳</span>
                          )}
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
                        <td className="px-3 py-2.5 font-mono text-primary font-bold">
                          {detail?.genericPN ?? (c.lookupId?.toUpperCase() || "—")}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{detail?.category ?? "—"}</td>
                        <td className="px-3 py-2.5 text-center font-mono font-bold text-primary">{c.qty}</td>
                        {buildQty > 1 && (
                          <td className="px-3 py-2.5 text-center font-mono font-bold text-amber-600">
                            {qtyNeeded.toLocaleString()}
                          </td>
                        )}
                        <td className="px-3 py-2.5 text-center font-mono text-muted-foreground">
                          {detail ? detail.brands.length : (c.brandsCount ?? "—")}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                          {detail ? detail.stock.toLocaleString() : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-foreground">
                          {price ? formatINR(price) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-foreground">
                          {price ? formatINR(lineTotal(c)) : "—"}
                        </td>
                      </tr>
                    )
                  })}
                  {/* Totals Row */}
                  <tr className="bg-muted/40 font-bold border-t-2 border-border">
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3 uppercase text-[10px] tracking-wider text-muted-foreground" colSpan={5}>
                      Total — {bomRows.length} line items across {product.structure.length} PCBs
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
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Excel view footer actions */}
            <div className="flex items-center justify-between border-t border-border bg-muted/10 px-6 py-3">
              <span className="text-xs text-muted-foreground font-medium">
                Estimated BOM cost{buildQty > 1 ? ` for ${buildQty.toLocaleString()} units` : " per unit"}:{" "}
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

        {/* Right Product Details & Calculator Panel */}
        <div className="space-y-6">
          <Card className="border border-border shadow-sm">
            <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg font-bold">Product Details</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Product Name</span>
                  <span className="text-xl font-extrabold text-foreground">{product.name}</span>
                </div>
                
                <div className="flex flex-col gap-1 border-t border-border/50 pt-3">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Description</span>
                  <span className="text-sm text-muted-foreground leading-normal">{product.description}</span>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-border/50 pt-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Code</span>
                    <span className="font-mono font-bold text-foreground text-sm">{product.code}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Version</span>
                    <span className="font-semibold text-foreground text-sm">{product.version}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-border/50 pt-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">PCBs Used</span>
                    <span className="font-bold text-foreground text-sm">{product.pcbsCount}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Unique Components</span>
                    <span className="font-bold text-foreground text-sm">{product.uniqueComponentsCount}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-border/50 pt-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Total Components</span>
                    <span className="font-bold text-foreground text-sm">{product.totalComponentsCount.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Estimated Cost</span>
                    <span className="font-bold text-primary text-sm font-mono">{product.estimatedCost}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Build Quantity Requirement Calculator */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg font-bold">Build Calculator</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Build Target Quantity</label>
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
                  Input assembly build targets to instantly calculate and scale raw part requirement metrics across the entire tree.
                </p>
              </div>
              
              {buildQty > 1 && (
                <div className="bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/10 dark:border-amber-500/20 rounded-lg p-3 space-y-2">
                  <span className="text-[10px] uppercase font-bold text-amber-600 block">Scaled Requirement Example:</span>
                  <div className="text-xs font-semibold text-muted-foreground">
                    Resistor 10K: <span className="font-mono text-foreground font-bold">20</span> × <span className="font-mono text-foreground font-bold">{buildQty.toLocaleString()}</span> = <span className="font-mono text-amber-600 font-bold">{(20 * buildQty).toLocaleString()} required</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Details Slide-out Drawer overlay */}
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
                <h3 className="text-lg font-bold text-foreground">Component Details Drawer</h3>
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

            {/* Approved Brands Section */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span className="text-xs uppercase font-bold text-muted-foreground/70 tracking-wider">Approved Brands ({selectedComponentDetail.brands.length})</span>
              </div>
              <div className="border border-border rounded-lg overflow-hidden text-xs">
                <table className="w-full text-left text-foreground">
                  <thead className="bg-muted/40 text-muted-foreground border-b border-border text-[10px] uppercase font-semibold">
                    <tr>
                      <th scope="col" className="px-4 py-2">Brand</th>
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
                <Landmark className="h-4 w-4 text-primary" />
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
                <span>Open Full Component Dashboard</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProductStructurePage() {
  return (
    <React.Suspense fallback={
      <div className="flex h-[400px] items-center justify-center text-muted-foreground text-sm font-medium">
        Loading product structure...
      </div>
    }>
      <ProductStructureContent />
    </React.Suspense>
  )
}
