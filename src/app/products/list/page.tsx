"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Cpu, Nut, Package, Search,
  CheckCircle2, ArrowRight, Award, Layers,
  XCircle, AlertTriangle, RefreshCw, Upload, FileSpreadsheet, Trash2, PencilRuler, GitBranch,
  Check, AlertCircle, X
} from "lucide-react"
import { useData } from "@/lib/data-provider"
import { useUserProducts, activeVersionOf } from "@/lib/user-products"
import { ImportProductBomModal } from "@/components/products/import-product-bom-modal"
import { AddProductModal, type ManualProductData } from "@/components/products/add-product-modal"
import type { ImportedPcb } from "@/lib/bom-import"

interface ProductData {
  id: string
  name: string
  description: string
  pcbs: number
  components: number
  brands: number
  buildableQty: number
  status: "Ready" | "Blocked" | "Limited"
  imported?: boolean
  /** For user products: how it was created and how many BOM versions it holds. */
  userSource?: "import" | "manual"
  versionCount?: number
  activeVersionLabel?: string
  totalParts?: number
}

// View model derived from the centralized product → PCB → component graph.
function buildProductsData(d: ReturnType<typeof useData>): ProductData[] {
  return d.PRODUCTS.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    pcbs: p.pcbs.length,
    components: d.productUniqueComponents(p).length,
    brands: d.productBrandCount(p),
    buildableQty: p.buildableQty,
    status: p.status,
  }))
}

export default function ProductListPage() {
  const d = useData()
  const router = useRouter()
  const { products: userProducts, removeProduct } = useUserProducts()
  const [isImportOpen, setIsImportOpen] = React.useState(false)
  const [isManualOpen, setIsManualOpen] = React.useState(false)
  const [toast, setToast] = React.useState<{ message: string; type: "success" | "error" } | null>(null)
  /** Product pending delete (confirmation modal), or null. */
  const [deleteTarget, setDeleteTarget] = React.useState<ProductData | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const PRODUCTS_DATA = React.useMemo(() => {
    const catalog = buildProductsData(d)
    const custom: ProductData[] = userProducts.map((p) => {
      const active = activeVersionOf(p)
      const lines = active?.lines ?? []
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        pcbs: new Set(lines.map((l) => l.type || "Uncategorized")).size,
        components: lines.length,
        brands: new Set(lines.map((l) => l.manufacturer).filter(Boolean)).size,
        buildableQty: 0,
        totalParts: lines.reduce((s, l) => s + l.qty, 0),
        status: "Limited",
        imported: true,
        userSource: p.source,
        versionCount: p.versions.length,
        activeVersionLabel: active?.label,
      }
    })
    return [...custom, ...catalog]
  }, [d, userProducts])

  const handleApplyImport = async (pcbs: ImportedPcb[], productName: string, fileName: string) => {
    try {
      // A multi-sheet BOM creates a REAL catalog product where each selected tab
      // becomes its own PCB (product → PCB → components), matching the manual
      // "Add Product" shape. Each line links an existing component by part number
      // or is created on the fly, so the product feeds the dashboard.
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: productName,
          description: `Imported from ${fileName}`,
          pcbs: pcbs.map((pcb) => ({
            name: pcb.name || pcb.sheetName,
            qty: 1,
            lines: pcb.lines.map((l) => ({
              name: l.name || undefined,
              partNumber: l.partNumber || undefined,
              type: l.type || undefined,
              solderType:
                l.solderType === "SMD" || l.solderType === "DIP" ? l.solderType : undefined,
              footprint: l.footprint || undefined,
              qty: l.qty,
              refDes: l.reference || undefined,
              manufacturer: l.manufacturer || undefined,
              supplier: l.supplier || undefined,
            })),
          })),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error?.message || `Request failed (${res.status})`)
      const created = body.data as { slug: string }
      setIsImportOpen(false)
      await d.reload() // refetch the catalog so the imported product appears in the list/structure
      router.push(`/products/structure?product=${created.slug}`)
    } catch (err) {
      console.error(err)
      showToast(err instanceof Error ? err.message : "Failed to save product", "error")
    }
  }

  const handleApplyManual = async (data: ManualProductData) => {
    try {
      // Manual entry now creates a REAL catalog product (product → BOM → Main Board
      // PCB → components) via POST /api/products, so it shows on the dashboard.
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: data.name,
          code: data.code || undefined,
          description: data.description || undefined,
          versionLabel: data.versionLabel || undefined,
          pcbs: data.pcbs.map((pcb) => ({
            name: pcb.name || undefined,
            qty: pcb.qty,
            linkedPcbId: pcb.linkedPcbId || undefined,
            lines: pcb.lines.map((l) => ({
              componentId: l.componentId,
              name: l.name || undefined,
              partNumber: l.partNumber || undefined,
              type: l.type || undefined,
              solderType: l.solderType === "SMD" || l.solderType === "DIP" ? l.solderType : undefined,
              footprint: l.footprint || undefined,
              qty: l.qty,
            })),
          })),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error?.message || `Request failed (${res.status})`)
      const created = body.data as { slug: string }
      setIsManualOpen(false)
      await d.reload() // refetch the catalog so the new product appears in the list/structure
      router.push(`/products/structure?product=${created.slug}`)
    } catch (err) {
      console.error(err)
      showToast(err instanceof Error ? err.message : "Failed to save product", "error")
    }
  }

  // Delete confirmed from the modal — handles both imported (user-products) and
  // catalog products, with toast feedback (replaces the old window.confirm/alert).
  const confirmDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      if (deleteTarget.imported) {
        await removeProduct(deleteTarget.id)
      } else {
        const res = await fetch(`/api/products/${deleteTarget.id}`, {
          method: "DELETE",
          credentials: "same-origin",
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body?.error?.message || `Request failed (${res.status})`)
        await d.reload() // refetch the catalog so the deleted product drops off the list
      }
      showToast(`Product "${deleteTarget.name}" deleted`)
      setDeleteTarget(null)
    } catch (err) {
      console.error(err)
      showToast(err instanceof Error ? err.message : "Failed to delete product", "error")
    } finally {
      setIsDeleting(false)
    }
  }

  const [searchQuery, setSearchQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("All")

  const handleResetFilters = () => {
    setSearchQuery("")
    setStatusFilter("All")
  }

  // Filter products based on search query and status
  const filteredProducts = PRODUCTS_DATA.filter((product) => {
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase()
      const matchesSearch = 
        product.name.toLowerCase().includes(q) || 
        product.description.toLowerCase().includes(q)
      if (!matchesSearch) return false
    }

    if (statusFilter !== "All" && product.status !== statusFilter) {
      return false
    }

    return true
  })

  const getStatusBadge = (status: "Ready" | "Blocked" | "Limited") => {
    switch (status) {
      case "Ready":
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            Ready
          </span>
        )
      case "Blocked":
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold bg-destructive/10 text-destructive border border-destructive/20 dark:bg-destructive/20 dark:text-destructive-foreground">
            <XCircle className="h-3 w-3" />
            Blocked
          </span>
        )
      case "Limited":
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Limited
          </span>
        )
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg transition-all animate-in fade-in slide-in-from-bottom-5 duration-300 ${
          toast.type === "success"
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
            : "bg-destructive/10 border-destructive/20 text-destructive"
        }`}>
          {toast.type === "success" ? <Check className="h-4 w-4 text-emerald-500" /> : <AlertCircle className="h-4 w-4" />}
          <span className="text-sm font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-muted-foreground flex items-center gap-2 font-medium">
            <span className="hover:text-foreground transition-colors cursor-pointer">Products</span>
            <span>/</span>
            <span className="text-foreground font-semibold">Product List</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Product List
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage finished assemblies, configuration variables, and general catalog specifications.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <Button
            onClick={() => setIsManualOpen(true)}
            variant="outline"
            className="gap-2 font-semibold border-border bg-background"
          >
            <PencilRuler className="h-4 w-4" />
            <span>Add Manually</span>
          </Button>
          <Button render={<Link href="/products/import" />} className="gap-2 font-semibold">
            <Upload className="h-4 w-4" />
            <span>Import BOM</span>
          </Button>
        </div>
      </div>

      {/* Top Controls: Search & Filter */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-card border border-border p-4 rounded-xl shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input 
            placeholder="Search products..." 
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
              <option value="Ready">Ready</option>
              <option value="Limited">Limited</option>
              <option value="Blocked">Blocked</option>
            </select>
          </div>
          {(searchQuery !== "" || statusFilter !== "All") && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer" onClick={handleResetFilters}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Product Cards Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filteredProducts.map((product) => (
          <Card key={product.id} className="flex flex-col transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 border border-border bg-card group relative overflow-hidden">
            <div className="absolute top-0 right-0 h-16 w-16 -mr-4 -mt-4 rounded-full bg-primary/5 transition-all group-hover:scale-110" />
            
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/10">
                    <Package className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold group-hover:text-primary transition-colors">
                      {product.name}
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5 line-clamp-1">
                      {product.description}
                    </CardDescription>
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  {product.imported ? (
                    <>
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                        {product.userSource === "manual" ? (
                          <PencilRuler className="h-3 w-3" />
                        ) : (
                          <FileSpreadsheet className="h-3 w-3" />
                        )}
                        {product.userSource === "manual" ? "Manual" : "Imported"}
                      </span>
                      {(product.versionCount ?? 1) > 1 && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-muted text-muted-foreground border border-border">
                          <GitBranch className="h-3 w-3" />
                          {product.versionCount} BOMs
                        </span>
                      )}
                    </>
                  ) : (
                    getStatusBadge(product.status)
                  )}
                </div>
              </div>
            </CardHeader>

            {/* Core Metrics Grid */}
            <CardContent className="flex-1 py-4 border-t border-b border-border/50 bg-muted/5">
              <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-xs">
                
                {/* PCBs / Types Metric */}
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground border border-border/60">
                    <Cpu className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground leading-none">{product.imported ? "Types" : "PCBs"}</span>
                    <span className="text-sm font-black mt-1 text-foreground">{product.pcbs}</span>
                  </div>
                </div>

                {/* Components Metric */}
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground border border-border/60">
                    <Nut className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground leading-none">Items</span>
                    <span className="text-sm font-black mt-1 text-foreground">{product.components}</span>
                  </div>
                </div>

                {/* Brands Metric */}
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground border border-border/60">
                    <Award className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground leading-none">Manufacturers</span>
                    <span className="text-sm font-black mt-1 text-foreground">{product.brands}</span>
                  </div>
                </div>

                {/* Buildable Qty / Total Parts Metric */}
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground border border-border/60">
                    <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground leading-none">{product.imported ? "Total Parts" : "Buildable Qty"}</span>
                    <span className="text-sm font-black mt-1 text-foreground">
                      {product.imported ? (product.totalParts ?? 0).toLocaleString() : product.buildableQty}
                    </span>
                  </div>
                </div>

              </div>
            </CardContent>

            <CardFooter className="pt-4 gap-2">
              <Button
                render={<Link href={`/products/structure?product=${product.id}`} />}
                className="flex-1 font-semibold group/btn"
                variant="secondary"
              >
                <span>View Structure</span>
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Delete product"
                onClick={() => setDeleteTarget(product)}
                className="border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        ))}

        {filteredProducts.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground font-semibold bg-card border border-border rounded-xl shadow-2xs">
            No products match your search or filter.
          </div>
        )}
      </div>

      {/* Add product — import a BOM */}
      {isImportOpen && (
        <ImportProductBomModal
          onApply={handleApplyImport}
          onClose={() => setIsImportOpen(false)}
        />
      )}

      {/* Add product — manual entry */}
      {isManualOpen && (
        <AddProductModal
          mode="product"
          onApply={handleApplyManual}
          onClose={() => setIsManualOpen(false)}
        />
      )}

      {/* Delete product — confirmation */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => !isDeleting && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border bg-muted/20 px-6 py-4">
              <h3 className="text-lg font-bold text-foreground">Delete Product</h3>
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
              <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p>
                  Deleting <strong>{deleteTarget.name}</strong> removes it and its BOM from the product list. This cannot
                  be undone.
                </p>
              </div>
              <p className="text-sm font-semibold text-foreground/80">Are you sure you want to delete this product?</p>
              <div className="flex items-center justify-end gap-3 border-t border-border/50 pt-4">
                <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
                  Cancel
                </Button>
                <Button
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold"
                >
                  {isDeleting ? "Deleting…" : "Delete Product"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
