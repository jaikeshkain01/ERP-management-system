"use client"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Cpu, ListTree, Nut, Package, ArrowLeft, Layers, Truck, Calculator, X, Award, ShieldCheck, Landmark, Star, Check, AlertCircle, Table2, Download, Upload, Plus, Trash2, FileSpreadsheet, PencilRuler, GitBranch } from "lucide-react"
import Link from "next/link"
import { exportToExcel } from "@/lib/export-excel"
import { useData } from "@/lib/data-provider"
import type { Component as MComponent } from "@/lib/catalog"
import { ImportBomModal } from "@/components/products/import-bom-modal"
import { AddProductModal, type ManualProductData } from "@/components/products/add-product-modal"
import { ImportedBomView } from "@/components/products/imported-bom-view"
import type { BomImportResult, ImportedBomLine } from "@/lib/bom-import"
import { useUserProducts, activeVersionOf, isUserProductId } from "@/lib/user-products"
import { useDragScroll } from "@/hooks/use-drag-scroll"

interface ComponentItem {
  name: string
  type: string
  suppliers: string[]
  qty: number
  brandsCount?: number
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
    PRODUCTS, getProduct, getComponent, getSupplierName, getBrandName, productPcbList, pcbBom,
    componentBrands, componentStockStatus, bestPrice, productUniqueComponents,
    productTotalParts, formatINR: fmtINR, formatLeadTime, reload,
  } = useData()

  const [buildQty, setBuildQty] = React.useState(1)
  const [selectedCompId, setSelectedCompId] = React.useState<string | null>(null)
  const [expandedComponents, setExpandedComponents] = React.useState<Record<string, boolean>>({})
  const [viewMode, setViewMode] = React.useState<"tree" | "excel">("tree")
  const [importVersionOpen, setImportVersionOpen] = React.useState(false)
  const [manualVersionOpen, setManualVersionOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const dragScrollRef = useDragScroll()

  const router = useRouter()
  const { getProduct: getUserProduct, addVersion, setActiveVersion, removeProduct, loaded: userProductsLoaded } = useUserProducts()

  const userProduct = getUserProduct(productId)
  const isUserProduct = !!userProduct
  const activeVersion = userProduct ? activeVersionOf(userProduct) : undefined
  const activeLines = activeVersion?.lines ?? []
  // A user-product id whose record isn't in the store yet: the localStorage-backed
  // store is still hydrating (or the product was removed). Avoid flashing catalog data.
  const looksUser = isUserProductId(productId)

  // User-product BOMs read best as a flat table; default to that on navigation.
  React.useEffect(() => {
    if (isUserProduct) setViewMode("excel")
  }, [productId, isUserProduct])

  const nextVersionLabel = `v${(userProduct?.versions.length ?? 0) + 1}`

  const handleImportVersion = async (result: BomImportResult, versionLabel: string, fileName: string) => {
    if (!userProduct) return
    try {
      await addVersion(productId, { label: versionLabel, source: "import", fileName, lines: result.lines })
      setImportVersionOpen(false)
      setSelectedCompId(null)
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : "Failed to add version")
    }
  }

  const handleManualVersion = async (data: ManualProductData) => {
    if (!userProduct) return
    try {
      await addVersion(productId, { label: data.versionLabel, source: "manual", lines: data.lines })
      setManualVersionOpen(false)
      setSelectedCompId(null)
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : "Failed to add version")
    }
  }

  const handleDeleteProduct = async () => {
    try {
      await removeProduct(productId)
      router.push("/products/list")
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : "Failed to remove product")
    }
  }

  // Catalog products (created via Add Manually / Import BOM) are soft-deleted
  // server-side; refetch the catalog so the product drops off the list.
  const handleDeleteCatalog = async () => {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(productId)}`, {
        method: "DELETE",
        credentials: "same-origin",
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error?.message || `Request failed (${res.status})`)
      await reload()
      router.push("/products/list")
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete product")
      setIsDeleting(false)
    }
  }

  const formatINR = (n: number) =>
    "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Catalog product for this id (undefined for user products or an empty catalog).
  const productEntity = getProduct(productId)

  // Neither a catalog product, a user product, nor a user-product id still hydrating
  // → nothing to show (e.g. empty database or a stale link). Render an empty state
  // rather than crashing on productEntity.name.
  if (!productEntity && !isUserProduct && !looksUser) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <span>Products</span>
            <span>/</span>
            <span className="text-foreground font-medium">Product Structure</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Product Structure</h1>
        </div>
        <Card className="border border-border shadow-sm">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Package className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-bold text-foreground">No product to display</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                There are no products in the system yet. Add a product or import a BOM to view its assembly structure.
              </p>
            </div>
            <Button variant="outline" render={<Link href="/products/list" />} className="gap-2 border-border bg-background">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Product List</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // A user-product id whose record hasn't arrived from the server yet: show a
  // loader while fetching, or the empty state if it's genuinely gone (stale link).
  if (looksUser && !isUserProduct && !productEntity) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <span>Products</span>
            <span>/</span>
            <span className="text-foreground font-medium">Product Structure</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Product Structure</h1>
        </div>
        <Card className="border border-border shadow-sm">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            {!userProductsLoaded ? (
              <>
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                <p className="text-sm text-muted-foreground">Loading product…</p>
              </>
            ) : (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Package className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-bold text-foreground">Product not found</p>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    This product no longer exists. It may have been removed.
                  </p>
                </div>
                <Button variant="outline" render={<Link href="/products/list" />} className="gap-2 border-border bg-background">
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Product List</span>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

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

  // Assembly tree view model (product → PCB → component). For user products (no
  // catalog entity) this stays empty — the display uses the userProduct fields below.
  const product: ProductData = productEntity
    ? {
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
          components: pcbBom(pcb).map(({ component, qty, refDes, preferredBrandId, remarks }): ComponentItem => ({
            name: component.name,
            type: component.category,
            suppliers: component.offers.map((o) => getSupplierName(o.supplierId)),
            qty: qty * pcbQty,
            brandsCount: componentBrands(component).length,
            lookupId: component.id,
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
        })),
      }
    : {
        name: "",
        code: "",
        version: "",
        pcbsCount: 0,
        uniqueComponentsCount: 0,
        totalComponentsCount: 0,
        estimatedCost: formatINR(0).replace(/\.00$/, ""),
        description: "",
        structure: [],
      }

  // User-product (imported/manual) summary — drives the Product Details panel + export.
  const userTotalParts = activeLines.reduce((s, l) => s + l.qty, 0)
  const userTypeGroups = new Set(activeLines.map((l) => l.type || "Uncategorized")).size

  const displayName = isUserProduct ? userProduct!.name : product.name
  const displayDescription = isUserProduct ? userProduct!.description : product.description
  const displayCode = isUserProduct ? userProduct!.code || "—" : product.code
  const displayVersion = isUserProduct ? activeVersion?.label ?? "—" : product.version
  const displayPcbCount = isUserProduct ? userTypeGroups : product.pcbsCount
  const displayUniqueCount = isUserProduct ? activeLines.length : product.uniqueComponentsCount
  const displayTotalCount = isUserProduct ? userTotalParts : product.totalComponentsCount
  const displayCost = isUserProduct ? "—" : product.estimatedCost

  const handleExportUser = () => {
    if (!userProduct || !activeVersion) return
    const scaled = buildQty > 1
    const tag = `${userProduct.name}-${activeVersion.label}`.replace(/\s+/g, "-")
    exportToExcel({
      fileName: `${tag}-BOM${scaled ? `-x${buildQty}` : ""}`,
      sheetName: `${userProduct.name} ${activeVersion.label}`.slice(0, 28) || "BOM",
      columns: [
        { header: "#", value: (_l, i) => i + 1, type: "Number", width: 4 },
        { header: "Reference", value: (l) => l.reference, width: 14 },
        { header: "Type", value: (l) => l.type, width: 14 },
        { header: "Name", value: (l) => l.name, width: 28 },
        { header: "Part Number", value: (l) => l.partNumber, width: 20 },
        { header: "Solder Type", value: (l) => l.solderType, width: 10 },
        { header: "Footprint", value: (l) => l.footprint, width: 20 },
        { header: "Qty / Unit", value: (l) => l.qty, type: "Number", width: 10 },
        ...(scaled
          ? [{ header: "Qty Needed", value: (l: ImportedBomLine) => l.qty * buildQty, type: "Number" as const, width: 12 }]
          : []),
        { header: "Manufacturer", value: (l) => l.manufacturer, width: 16 },
        { header: "Supplier", value: (l) => l.supplier, width: 16 },
      ],
      rows: activeLines,
      totalsRow: [
        "",                                 // #
        "",                                 // Reference
        "TOTAL",                            // Type
        `${activeLines.length} items`,      // Name
        "",                                 // Part Number
        "",                                 // Solder Type
        "",                                 // Footprint
        userTotalParts,                     // Qty / Unit
        ...(scaled ? [userTotalParts * buildQty] : []), // Qty Needed
        "",                                 // Manufacturer
        "",                                 // Supplier
      ],
    })
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
        { header: "Ref Des", value: (r) => r.comp.refDes ?? "", width: 14 },
        { header: "Type", value: (r) => r.comp.type, width: 14 },
        { header: "Name", value: (r) => r.comp.name, width: 22 },
        { header: "Part Number", value: (r) => r.comp.partNumber ?? "", width: 20 },
        { header: "Solder Type", value: (r) => r.comp.solderType ?? "", width: 11 },
        { header: "Footprint", value: (r) => r.comp.footprint ?? "", width: 20 },
        { header: "Qty / Unit", value: (r) => r.comp.qty, type: "Number", width: 10 },
        ...(scaled
          ? [{ header: "Qty Needed", value: (r: { comp: ComponentItem }) => r.comp.qty * buildQty, type: "Number" as const, width: 12 }]
          : []),
        { header: "SPQ", value: (r) => r.comp.spq ?? "", type: "Number", width: 8 },
        { header: "Manufacturer", value: (r) => detailOf(r.comp)?.brands.map((b) => b.name).join(", ") ?? "", width: 22 },
        { header: "Unit Price (INR)", value: (r) => unitPriceOf(r.comp) || "", type: "Number", width: 14 },
        { header: "Total Price (INR)", value: (r) => Number(lineTotal(r.comp).toFixed(2)), type: "Number", width: 15 },
        { header: "Available Qty", value: (r) => r.comp.availableQty ?? "", type: "Number", width: 12 },
      ],
      rows: bomRows,
      totalsRow: [
        "",                                 // #
        "TOTAL",                            // PCB
        "",                                 // Ref Des
        `${bomRows.length} items`,          // Type
        "",                                 // Name
        "",                                 // Part Number
        "",                                 // Solder Type
        "",                                 // Footprint
        totalParts,                         // Qty / Unit
        ...(scaled ? [totalParts * buildQty] : []), // Qty Needed
        "",                                 // SPQ
        "",                                 // Manufacturer
        "",                                 // Unit Price
        Number(bomTotalValue.toFixed(2)),   // Total Price
        "",                                 // Available Qty
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

  // User-product id but nothing in the store yet: either the store is still
  // hydrating from localStorage, or the product was removed. Avoid flashing an
  // unrelated catalog product.
  if (looksUser && !userProduct) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center gap-3 text-center">
        <Package className="h-10 w-10 text-muted-foreground/50 stroke-1" />
        <p className="text-sm font-semibold text-muted-foreground">Loading product…</p>
        <Link href="/products/list" className="text-xs font-semibold text-primary hover:underline">
          Back to Product List
        </Link>
      </div>
    )
  }

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
            onClick={isUserProduct ? handleExportUser : handleExportExcel}
            variant="outline"
            className="gap-2 border-border bg-background cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>Export to Excel</span>
          </Button>
          {!isUserProduct && productEntity && (
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(true)}
              className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive bg-background cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete</span>
            </Button>
          )}
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

      {/* BOM version toolbar (user products) */}
      {isUserProduct && userProduct && activeVersion && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                {userProduct.source === "manual" ? (
                  <PencilRuler className="h-4 w-4" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" />
                )}
              </div>
              <div className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground">{userProduct.name}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {userProduct.source === "manual" ? "Manual" : "Imported"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Active BOM: <span className="font-bold text-foreground">{activeVersion.label}</span> ·{" "}
                  {activeVersion.source === "import"
                    ? <>imported from <span className="font-mono">{activeVersion.fileName || "file"}</span></>
                    : "entered manually"}{" "}
                  · {activeLines.length} lines
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
              <Button variant="outline" size="sm" onClick={() => setImportVersionOpen(true)} className="gap-1.5 border-border bg-background cursor-pointer">
                <Upload className="h-3.5 w-3.5" />
                <span>Import version</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setManualVersionOpen(true)} className="gap-1.5 border-border bg-background cursor-pointer">
                <Plus className="h-3.5 w-3.5" />
                <span>Manual version</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleDeleteProduct} className="gap-1.5 border-border bg-background text-muted-foreground hover:text-destructive hover:border-destructive/40 cursor-pointer">
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete</span>
              </Button>
            </div>
          </div>

          {/* Version selector tabs */}
          <div className="flex items-center gap-1.5 flex-wrap border-t border-primary/15 pt-2.5">
            <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-muted-foreground/70 tracking-wider mr-1">
              <GitBranch className="h-3.5 w-3.5" />
              BOM Versions
            </span>
            {userProduct.versions.map((v) => {
              const active = v.id === activeVersion.id
              return (
                <button
                  key={v.id}
                  onClick={() => {
                    setSelectedCompId(null)
                    setActiveVersion(productId, v.id).catch((err) => {
                      console.error(err)
                      alert(err instanceof Error ? err.message : "Failed to switch version")
                    })
                  }}
                  title={`${v.source === "import" ? "Imported" : "Manual"} · ${v.lines.length} lines`}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer ${
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-2xs"
                      : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/40"
                  }`}
                >
                  <span>{v.label}</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${v.source === "import" ? "bg-sky-400" : "bg-amber-400"}`} />
                </button>
              )
            })}
          </div>
        </div>
      )}

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
                    {isUserProduct
                      ? viewMode === "tree"
                        ? `BOM ${displayVersion} for ${displayName}, grouped by component type.`
                        : `Flat BOM sheet (${displayVersion}) for ${displayName}.`
                      : viewMode === "tree"
                        ? `Visual breakdown of ${displayName} components. Click on a component to view specifications.`
                        : `Flat BOM sheet for ${displayName} across all PCBs. Click a row to view details.`}
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

          {/* ===== USER-PRODUCT BOM VIEW (imported or manual) ===== */}
          {isUserProduct && (
            <CardContent className="p-0">
              <ImportedBomView
                productName={displayName}
                lines={activeLines}
                viewMode={viewMode}
                buildQty={buildQty}
              />
            </CardContent>
          )}

          {/* ===== TREE VIEW ===== */}
          {!isUserProduct && viewMode === "tree" && (
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
          {!isUserProduct && viewMode === "excel" && (
          <CardContent className="p-0">
            <div ref={dragScrollRef} className="overflow-x-auto cursor-grab">
              <table className="w-full text-left text-xs text-foreground whitespace-nowrap">
                <thead className="bg-muted/40 text-muted-foreground border-b border-border text-[10px] uppercase font-bold sticky top-0">
                  <tr>
                    <th scope="col" className="px-3 py-3 text-center w-10">#</th>
                    <th scope="col" className="px-3 py-3">PCB</th>
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
                          {detail && detail.brands.length > 0 ? (
                            <span className="font-semibold text-foreground">
                              {detail.brands[0].name}
                              {detail.brands.length > 1 && (
                                <span className="text-muted-foreground font-mono"> +{detail.brands.length - 1}</span>
                              )}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-foreground">
                          {price ? formatINR(price) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-foreground">
                          {price ? formatINR(lineTotal(c)) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {c.availableQty !== undefined ? (
                            <span className={`font-mono font-bold ${c.availableQty < qtyNeeded ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
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
                    <td className="px-3 py-3 uppercase text-[10px] tracking-wider text-muted-foreground" colSpan={7}>
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
                    <td className="px-3 py-3" />
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
                  <span className="text-xl font-extrabold text-foreground">{displayName}</span>
                </div>

                <div className="flex flex-col gap-1 border-t border-border/50 pt-3">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Description</span>
                  <span className="text-sm text-muted-foreground leading-normal">{displayDescription}</span>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-border/50 pt-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Code</span>
                    <span className="font-mono font-bold text-foreground text-sm">{displayCode}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Version</span>
                    <span className="font-semibold text-foreground text-sm">{displayVersion}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-border/50 pt-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">{isUserProduct ? "Type Groups" : "PCBs Used"}</span>
                    <span className="font-bold text-foreground text-sm">{displayPcbCount}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">{isUserProduct ? "BOM Lines" : "Unique Components"}</span>
                    <span className="font-bold text-foreground text-sm">{displayUniqueCount}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-border/50 pt-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Total Components</span>
                    <span className="font-bold text-foreground text-sm">{displayTotalCount.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Estimated Cost</span>
                    <span className="font-bold text-primary text-sm font-mono">{displayCost}</span>
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

      {/* Add BOM version — via import */}
      {importVersionOpen && (
        <ImportBomModal
          title="Import a new BOM version"
          subtitle="Upload an .xlsx, .xls or .csv file — it becomes a new version of this product."
          nameLabel="BOM Version Label"
          namePlaceholder="e.g. v2, Rev B"
          submitLabel="Add Version"
          defaultProductName={nextVersionLabel}
          onApply={handleImportVersion}
          onClose={() => setImportVersionOpen(false)}
        />
      )}

      {/* Add BOM version — manual */}
      {manualVersionOpen && (
        <AddProductModal
          mode="version"
          defaultVersionLabel={nextVersionLabel}
          onApply={handleManualVersion}
          onClose={() => setManualVersionOpen(false)}
        />
      )}

      {/* Delete product — confirmation (catalog products) */}
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
              <h3 className="text-lg font-bold text-foreground">Delete Product</h3>
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
                  Deleting <strong>{displayName}</strong> removes it from the product list. Its PCBs and components stay
                  in the catalog. A product with production orders cannot be deleted.
                </p>
              </div>
              <p className="text-sm font-semibold text-foreground/80">Are you sure you want to delete this product?</p>
              <div className="flex items-center justify-end gap-3 border-t border-border/50 pt-4">
                <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={isDeleting}>
                  Cancel
                </Button>
                <Button
                  onClick={handleDeleteCatalog}
                  disabled={isDeleting}
                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold"
                >
                  {isDeleting ? "Deleting..." : "Delete Product"}
                </Button>
              </div>
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
