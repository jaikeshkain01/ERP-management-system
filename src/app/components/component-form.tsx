"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Plus, Trash2, CheckCircle2, AlertCircle, Cpu, Award, Lock, Warehouse } from "lucide-react"
import { extractError } from "@/lib/api-error"
import Link from "next/link"
import { useData } from "@/lib/data-provider"
import { CategoryCascade } from "@/components/category-cascade"

export interface Specification {
  key: string
  value: string
}

export interface BrandVariant {
  brand: string
  partNo: string
  stock: string
  /** True for variants that already exist on the component (edit mode). The
   * variants API is add-only, so existing ones are shown locked. */
  existing?: boolean
}

export interface ComponentFormInitial {
  category: string
  categoryId: string
  itemType: string
  name: string
  genericPN: string
  description: string
  unit: string
  minStock: string
  solderType: "SMD" | "DIP"
  footprint: string
  spq: string
  moq: string
  specifications: Specification[]
  brandVariants: BrandVariant[]
}

const UNIT_OPTIONS = ["PCS", "Reel", "Tray", "Meter", "Set", "Box", "Roll", "Kg"]

const ITEM_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "raw", label: "Raw (purchased part/material)" },
  { value: "semi_assembled", label: "Semi-assembled (sub-assembly / WIP)" },
  { value: "assembled", label: "Assembled (finished good)" },
  { value: "consumable", label: "Consumable" },
  { value: "asset", label: "Asset (IT / tools / equipment)" },
  { value: "packaging", label: "Packaging" },
]

/** Solder type + footprint only make sense for parts that go on a board. */
const isBoardItem = (itemType: string) => itemType === "raw" || itemType === "semi_assembled"

// Add-mode defaults — a clean, empty form (no demo/mock data).
const ADD_DEFAULTS: ComponentFormInitial = {
  category: "",
  categoryId: "",
  itemType: "raw",
  name: "",
  genericPN: "",
  description: "",
  unit: "PCS",
  minStock: "",
  solderType: "SMD",
  footprint: "",
  spq: "",
  moq: "",
  brandVariants: [{ brand: "", partNo: "", stock: "" }],
  specifications: [],
}

export function ComponentForm({
  mode,
  componentId,
  initial,
}: {
  mode: "add" | "edit"
  componentId?: string
  initial?: ComponentFormInitial
}) {
  const router = useRouter()
  const d = useData()
  const seed = initial ?? ADD_DEFAULTS
  const isEdit = mode === "edit"

  const [toast, setToast] = React.useState<{ message: string; type: "success" | "error" } | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  // Section 1: Basic Information
  // The item is filed under the deepest category node chosen in the cascade.
  const [categoryId, setCategoryId] = React.useState(seed.categoryId)
  const [itemType, setItemType] = React.useState(seed.itemType)
  const [name, setName] = React.useState(seed.name)
  const [genericPN, setGenericPN] = React.useState(seed.genericPN)
  const [description, setDescription] = React.useState(seed.description)
  const [unit, setUnit] = React.useState(seed.unit)
  const [minStock, setMinStock] = React.useState(seed.minStock)

  // Inline "add category" (lets the tree grow without leaving the form)
  const [newCatName, setNewCatName] = React.useState("")
  const [newCatParent, setNewCatParent] = React.useState("")
  const [creatingCat, setCreatingCat] = React.useState(false)

  // Category tree, flattened in path order with a depth indent for the picker.
  const categoryOptions = React.useMemo(
    () =>
      [...d.ITEM_CATEGORIES]
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((c) => ({ id: c.id, depth: c.path.split("/").length - 1, name: c.name })),
    [d],
  )
  const categoryName = d.getCategory(categoryId)?.name ?? ""

  // Section 2: PCB & Packaging Information
  const [solderType, setSolderType] = React.useState<"SMD" | "DIP">(seed.solderType)
  const [footprint, setFootprint] = React.useState(seed.footprint)
  const [spq, setSpq] = React.useState(seed.spq)
  const [moq, setMoq] = React.useState(seed.moq)

  // Section 3: Brand Variants (dynamic list)
  const [brandVariants, setBrandVariants] = React.useState<BrandVariant[]>(seed.brandVariants)

  // Section 4: Specifications (dynamic list)
  const [specifications, setSpecifications] = React.useState<Specification[]>(seed.specifications)

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Add mode only: suggest a generic part number from the name.
  React.useEffect(() => {
    if (!isEdit && !genericPN && name) {
      const cleanName = name.replace(/\s+/g, "-").toUpperCase()
      const prefix = categoryName.toLowerCase().includes("passive") ? "RES" : "COMP"
      setGenericPN(`${prefix}-${cleanName}`)
    }
  }, [name, categoryName, genericPN, isEdit])

  const handleCreateCategory = async () => {
    const nm = newCatName.trim()
    if (!nm) return
    setCreatingCat(true)
    try {
      const res = await fetch("/api/item-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nm, parentId: newCatParent || null }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) return showToast(body?.error?.message ?? "Failed to add category", "error")
      await d.reload()
      setCategoryId(body.data.id) // select the newly created node
      setNewCatName("")
      setNewCatParent("")
      showToast("Category added", "success")
    } finally {
      setCreatingCat(false)
    }
  }

  // ── Opening-stock location (Section 3 add-mode only) ──────────────────────
  // Loaded once when the user first enters any opening quantity. Empty tenants
  // (no warehouse) trigger the inline "Create warehouse + default bin" mini-form
  // so a fresh workspace can seed itself without leaving this page.
  interface BinOption { id: string; code: string; name: string | null; warehouseId: string; warehouseCode: string; warehouseName: string; isDefault: boolean }
  const [bins, setBins] = React.useState<BinOption[]>([])
  const [openingLocationId, setOpeningLocationId] = React.useState<string>("")
  const [binsLoaded, setBinsLoaded] = React.useState(false)
  const [binsLoading, setBinsLoading] = React.useState(false)
  const [showCreateWh, setShowCreateWh] = React.useState(false)
  const [creatingWh, setCreatingWh] = React.useState(false)
  const [newWh, setNewWh] = React.useState({ code: "", name: "", location: "", binCode: "MAIN-BIN", binName: "Default Bin" })

  /** Flatten every live warehouse's bins into one option list. Selected default:
   *  a bin flagged `is_default`, else the first bin available. */
  const loadBins = React.useCallback(async () => {
    setBinsLoading(true)
    try {
      const whRes = await fetch("/api/warehouses", { cache: "no-store" })
      const whBody = await whRes.json().catch(() => null)
      if (!whRes.ok) { showToast(extractError(whBody, "Failed to load warehouses").message, "error"); return }
      const warehouses: { id: string; code: string; name: string }[] = whBody?.data ?? []
      const collected: BinOption[] = []
      for (const w of warehouses) {
        const locRes = await fetch(`/api/warehouses/${w.id}/locations`, { cache: "no-store" })
        const locBody = await locRes.json().catch(() => null)
        if (!locRes.ok) continue
        for (const loc of (locBody?.data ?? []) as { id: string; code: string; name: string | null; kind: string; isDefault: boolean }[]) {
          if (loc.kind === "bin") collected.push({ id: loc.id, code: loc.code, name: loc.name, warehouseId: w.id, warehouseCode: w.code, warehouseName: w.name, isDefault: loc.isDefault })
        }
      }
      collected.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || a.warehouseCode.localeCompare(b.warehouseCode) || a.code.localeCompare(b.code))
      setBins(collected)
      // Preselect the default bin (or the first) so the picker is never blank.
      const preferred = collected.find((b) => b.isDefault) ?? collected[0]
      if (preferred && !openingLocationId) setOpeningLocationId(preferred.id)
      setBinsLoaded(true)
    } finally {
      setBinsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Any variant asks for opening stock → we need a bin. Lazy-load once.
  const openingRequested = React.useMemo(
    () => brandVariants.some((v) => !v.existing && v.stock.trim() !== "" && Number(v.stock) > 0),
    [brandVariants],
  )
  React.useEffect(() => {
    if (openingRequested && !binsLoaded && !binsLoading) void loadBins()
  }, [openingRequested, binsLoaded, binsLoading, loadBins])

  const handleCreateWarehouse = async () => {
    const code = newWh.code.trim()
    const name = newWh.name.trim()
    const binCode = newWh.binCode.trim() || "MAIN-BIN"
    if (!code || !name) return showToast("Warehouse code and name are required", "error")
    setCreatingWh(true)
    try {
      const wRes = await fetch("/api/warehouses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, location: newWh.location.trim() || undefined }),
      })
      const wBody = await wRes.json().catch(() => null)
      if (!wRes.ok) return showToast(extractError(wBody, "Failed to create warehouse").message, "error")
      const whId = wBody?.data?.id as string
      const bRes = await fetch(`/api/warehouses/${whId}/locations`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "bin", code: binCode, name: newWh.binName.trim() || null, isDefault: true }),
      })
      const bBody = await bRes.json().catch(() => null)
      if (!bRes.ok) return showToast(extractError(bBody, "Warehouse created but default bin failed").message, "error")
      showToast(`Created ${code} + default bin`, "success")
      // Re-fetch bins fresh so the new one is preselected via the default flag.
      setBinsLoaded(false)
      await loadBins()
      setShowCreateWh(false)
      setNewWh({ code: "", name: "", location: "", binCode: "MAIN-BIN", binName: "Default Bin" })
    } finally {
      setCreatingWh(false)
    }
  }

  // Brand Variants handlers
  const handleAddBrandVariant = () => setBrandVariants([...brandVariants, { brand: "", partNo: "", stock: "" }])
  const handleUpdateBrandVariant = (index: number, field: keyof BrandVariant, val: string) => {
    const updated = [...brandVariants]
    updated[index] = { ...updated[index], [field]: val }
    setBrandVariants(updated)
  }
  const handleRemoveBrandVariant = (index: number) => setBrandVariants(brandVariants.filter((_, i) => i !== index))

  // Specifications handlers
  const handleAddSpecification = () => setSpecifications([...specifications, { key: "", value: "" }])
  const handleUpdateSpecification = (index: number, field: keyof Specification, val: string) => {
    const updated = [...specifications]
    updated[index] = { ...updated[index], [field]: val }
    setSpecifications(updated)
  }
  const handleRemoveSpecification = (index: number) => setSpecifications(specifications.filter((_, i) => i !== index))

  const detailsHref = componentId ? `/items/details/${encodeURIComponent(componentId)}` : "/items/list"
  const cancelHref = isEdit ? detailsHref : "/items/list"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return showToast("Please enter item name", "error")
    if (!genericPN.trim()) return showToast("Please enter Generic Part Number", "error")

    setIsSubmitting(true)
    try {
      const specs = specifications.filter((s) => s.key.trim())
      const spqNum = spq ? parseInt(spq, 10) : undefined
      const moqNum = moq ? parseInt(moq, 10) : undefined
      const minStockNum = minStock.trim() !== "" ? Number(minStock) : undefined

      if (!isEdit) {
        const res = await fetch("/api/components", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            genericPN: genericPN.trim(),
            name: name.trim(),
            category: categoryName || undefined,
            categoryId: categoryId || undefined,
            itemType,
            description: description.trim() || undefined,
            unit: unit.trim() || undefined,
            minStock: minStockNum,
            solderType: isBoardItem(itemType) ? solderType : undefined,
            footprint: isBoardItem(itemType) ? footprint.trim() || undefined : undefined,
            spq: spqNum,
            reorderQty: moqNum,
            specs,
            variants: brandVariants
              .filter((v) => v.brand.trim() && v.partNo.trim())
              .map((v) => ({ brand: v.brand.trim(), partNo: v.partNo.trim(), stock: v.stock ? parseInt(v.stock, 10) : undefined })),
            // Only forward the location when opening stock is actually being seeded — otherwise the
            // server never touches storage_locations and an unset picker would be misleading.
            ...(openingRequested && openingLocationId ? { openingLocationId } : {}),
          }),
        })
        const body = await res.json().catch(() => null)
        if (!res.ok) return showToast(body?.error?.message ?? "Failed to register item", "error")
        showToast("Item registered successfully!", "success")
        setTimeout(() => router.push("/items/list"), 1000)
        return
      }

      // Edit mode: PATCH core fields + specs, then POST any newly-added variants.
      const res = await fetch(`/api/components/${encodeURIComponent(componentId!)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          genericPN: genericPN.trim(),
          name: name.trim(),
          category: categoryName || null,
          categoryId: categoryId || null,
          itemType,
          description: description.trim() || null,
          ...(unit.trim() ? { unit: unit.trim() } : {}),
          ...(minStockNum !== undefined ? { minStock: minStockNum } : {}),
          solderType: isBoardItem(itemType) ? solderType : null,
          footprint: isBoardItem(itemType) ? footprint.trim() || null : null,
          spq: spqNum ?? null,
          ...(moqNum !== undefined ? { reorderQty: moqNum } : {}),
          specs,
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) return showToast(body?.error?.message ?? "Failed to update item", "error")

      // New brand variants (existing ones are locked — the variants API is add-only).
      const newVariants = brandVariants.filter((v) => !v.existing && v.brand.trim() && v.partNo.trim())
      const failed: string[] = []
      for (const v of newVariants) {
        const vr = await fetch(`/api/components/${encodeURIComponent(componentId!)}/variants`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brand: v.brand.trim(), partNo: v.partNo.trim(),
            stock: v.stock ? parseInt(v.stock, 10) : undefined,
            ...(v.stock && Number(v.stock) > 0 && openingLocationId ? { openingLocationId } : {}),
          }),
        })
        if (!vr.ok) {
          const vb = await vr.json().catch(() => null)
          failed.push(`${v.brand}: ${vb?.error?.message ?? "failed"}`)
        }
      }

      d.reload()
      if (failed.length) {
        showToast(`Item saved, but some variants failed — ${failed.join("; ")}`, "error")
        return
      }
      showToast("Item updated successfully!", "success")
      setTimeout(() => router.push(detailsHref), 1000)
    } finally {
      setIsSubmitting(false)
    }
  }

  const commonFootprints =
    solderType === "SMD" ? ["0603", "0805", "1206", "SOT-23", "SOIC-8", "QFN-32"] : ["DIP-8", "DIP-14", "TO-92", "TO-220"]

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 shadow-xl border transition-all transform duration-300 bg-background ${
            toast.type === "success"
              ? "border-emerald-500/35 text-emerald-600 dark:text-emerald-400"
              : "border-destructive/35 text-destructive"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <AlertCircle className="h-4 w-4 text-destructive" />
          )}
          <span className="text-sm font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Header Navigation */}
      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <span>Items</span>
          <span>/</span>
          <Link href="/items/list" className="hover:text-foreground transition-colors font-medium">
            Item List
          </Link>
          <span>/</span>
          <span className="text-foreground font-semibold">{isEdit ? "Edit Item" : "Add Item"}</span>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" render={<Link href={cancelHref} />} className="h-9 w-9 rounded-lg border-border">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">{isEdit ? "Edit Item" : "Add Item"}</h1>
            <p className="text-muted-foreground">
              {isEdit
                ? "Update this item's details, packaging, variants and specifications."
                : "Register a new raw item with nested manufacturer variants."}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Basic Information */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="bg-muted/10 border-b border-border/60 py-4 px-6">
            <CardTitle className="text-lg font-bold text-foreground">Section 1 — Basic Information</CardTitle>
            <CardDescription>Core identity and internal tracking parameters</CardDescription>
          </CardHeader>
          <CardContent className="p-6 grid gap-6 md:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Item Type *</label>
              <select
                value={itemType}
                onChange={(e) => setItemType(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary font-medium"
              >
                {ITEM_TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <span className="text-[10px] text-muted-foreground">Drives behaviour (raw is bought, finished is shipped).</span>
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Category</label>
              <CategoryCascade value={categoryId} onChange={setCategoryId} allLabel="— Uncategorised —" manage />
              <span className="text-[10px] text-muted-foreground">Drill into the tree; filed under the deepest node picked (or add one below).</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Name *</label>
              <Input placeholder="e.g. Resistor 10K" value={name} onChange={(e) => setName(e.target.value)} required className="h-9" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Generic Part Number *</label>
              <Input placeholder="e.g. RES-10K" value={genericPN} onChange={(e) => setGenericPN(e.target.value)} required className="h-9" />
              <span className="text-[10px] text-muted-foreground">Internal company tracking code.</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Unit of Measure</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary font-medium"
              >
                {(UNIT_OPTIONS.includes(unit) ? UNIT_OPTIONS : [unit, ...UNIT_OPTIONS]).map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <span className="text-[10px] text-muted-foreground">Stocking unit (e.g. PCS, Reel, Meter).</span>
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-3">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</label>
              <textarea
                placeholder="Short description of the item (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary resize-y"
              />
            </div>

            {/* Inline category creator — grow the tree without leaving the form */}
            <div className="md:col-span-3 rounded-lg border border-dashed border-border bg-muted/10 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">New category name</label>
                  <Input
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="e.g. Resistors"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Under parent (optional)</label>
                  <select
                    value={newCatParent}
                    onChange={(e) => setNewCatParent(e.target.value)}
                    className="h-8 rounded-lg border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <option value="">— Top level —</option>
                    {categoryOptions.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={creatingCat || !newCatName.trim()}
                  onClick={handleCreateCategory}
                  className="h-8 gap-1 font-bold"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {creatingCat ? "Adding…" : "Add Category"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: PCB & Packaging Information */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="bg-muted/10 border-b border-border/60 py-4 px-6">
            <CardTitle className="text-lg font-bold text-foreground">Section 2 — PCB & Packaging Information</CardTitle>
            <CardDescription>Land footprints, packaging counts, and layout types</CardDescription>
          </CardHeader>
          <CardContent className="p-6 grid gap-6 md:grid-cols-2">
            {isBoardItem(itemType) && (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Solder Type</label>
                  <select
                    value={solderType}
                    onChange={(e) => setSolderType(e.target.value as "SMD" | "DIP")}
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary font-medium"
                  >
                    <option value="SMD">SMD (Surface Mount Device)</option>
                    <option value="DIP">DIP (Through Hole)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Footprint</label>
                  <Input placeholder="e.g. 0603, SOIC-8" value={footprint} onChange={(e) => setFootprint(e.target.value)} className="h-9" />
                  <div className="flex flex-wrap gap-1.5 mt-1 items-center">
                    <span className="text-[10px] text-muted-foreground font-bold mr-1">Suggestions:</span>
                    {commonFootprints.map((fp) => (
                      <button
                        key={fp}
                        type="button"
                        onClick={() => setFootprint(fp)}
                        className="text-[10px] border border-border hover:bg-primary/5 hover:border-primary hover:text-primary rounded px-2 py-0.5 font-medium transition-all"
                      >
                        {fp}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SPQ (Standard Pack Quantity)</label>
              <Input type="number" placeholder="e.g. 5000" value={spq} onChange={(e) => setSpq(e.target.value)} className="h-9" />
              <span className="text-[10px] text-muted-foreground">e.g. 5000 pcs per reel or 100 pcs per packet</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">MOQ (Minimum Order Quantity)</label>
              <Input type="number" placeholder="e.g. 1000" value={moq} onChange={(e) => setMoq(e.target.value)} className="h-9" />
              <span className="text-[10px] text-muted-foreground">Standard procurement batch threshold</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Minimum Stock (Reorder Point)</label>
              <Input type="number" min="0" placeholder="e.g. 500" value={minStock} onChange={(e) => setMinStock(e.target.value)} className="h-9" />
              <span className="text-[10px] text-muted-foreground">Safety-stock level — drives Low/Critical status &amp; reorder alerts.</span>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Brand Variants */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="bg-muted/10 border-b border-border/60 py-4 px-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold text-foreground">Section 3 — Manufacturer Variants</CardTitle>
                <CardDescription>
                  {isEdit
                    ? "Existing variants are locked; add new manufacturer part numbers below."
                    : "Map each manufacturer's part number (MPN) and opening stock for this generic part"}
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddBrandVariant}
                className="gap-1 border-border font-bold hover:bg-primary/5 hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Variant</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            {/* Opening-stock location picker — visible only when a variant has
                a positive stock value, since that's the only case the server
                writes to storage_locations. */}
            {openingRequested && (
              <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <Warehouse className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground">Opening stock destination</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Where should the initial quantities land? Every variant with a non-zero opening quantity goes into this bin.
                    </p>
                  </div>
                </div>

                {binsLoading && (
                  <div className="text-[11px] text-muted-foreground italic">Loading warehouses…</div>
                )}

                {!binsLoading && bins.length > 0 && !showCreateWh && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={openingLocationId}
                      onChange={(e) => setOpeningLocationId(e.target.value)}
                      className="flex-1 min-w-[240px] h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
                    >
                      {bins.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.warehouseCode} · {b.code}
                          {b.name ? ` — ${b.name}` : ""}
                          {b.isDefault ? "  (default)" : ""}
                        </option>
                      ))}
                    </select>
                    <Button type="button" size="sm" variant="outline" onClick={() => setShowCreateWh(true)} className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> New warehouse
                    </Button>
                  </div>
                )}

                {!binsLoading && binsLoaded && bins.length === 0 && !showCreateWh && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                    <div className="text-xs text-amber-700 dark:text-amber-400 font-semibold">
                      No warehouse in this workspace yet.
                    </div>
                    <Button type="button" size="sm" onClick={() => setShowCreateWh(true)} className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Create warehouse + bin
                    </Button>
                  </div>
                )}

                {showCreateWh && (
                  <div className="rounded-md border border-border bg-background p-3 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Warehouse code</label>
                        <Input value={newWh.code} onChange={(e) => setNewWh({ ...newWh, code: e.target.value })} placeholder="e.g. MAIN" className="h-8 text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Warehouse name</label>
                        <Input value={newWh.name} onChange={(e) => setNewWh({ ...newWh, name: e.target.value })} placeholder="e.g. Main Warehouse" className="h-8 text-sm" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Location (optional)</label>
                        <Input value={newWh.location} onChange={(e) => setNewWh({ ...newWh, location: e.target.value })} placeholder="e.g. Bengaluru" className="h-8 text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Default bin code</label>
                        <Input value={newWh.binCode} onChange={(e) => setNewWh({ ...newWh, binCode: e.target.value })} placeholder="MAIN-BIN" className="h-8 text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Default bin name</label>
                        <Input value={newWh.binName} onChange={(e) => setNewWh({ ...newWh, binName: e.target.value })} placeholder="Default Bin" className="h-8 text-sm" />
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button type="button" size="sm" variant="outline" onClick={() => setShowCreateWh(false)} disabled={creatingWh}>Cancel</Button>
                      <Button type="button" size="sm" onClick={handleCreateWarehouse} disabled={creatingWh} className="gap-1.5">
                        {creatingWh ? "Creating…" : (<><Plus className="h-3.5 w-3.5" /> Create</>)}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-sm text-left text-foreground">
                <thead className="text-[10px] uppercase bg-muted/40 text-muted-foreground border-b border-border">
                  <tr>
                    <th scope="col" className="px-6 py-3 font-bold w-1/3">Manufacturer</th>
                    <th scope="col" className="px-6 py-3 font-bold w-1/3">Manufacturer Part No (MPN)</th>
                    <th scope="col" className="px-6 py-3 font-bold w-1/4">{isEdit ? "Stock" : "Initial Stock"}</th>
                    <th scope="col" className="px-3 py-3 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-background">
                  {brandVariants.map((variant, idx) => (
                    <tr key={idx} className="hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-3">
                        <Input
                          placeholder="e.g. Yageo, Vishay"
                          value={variant.brand}
                          onChange={(e) => handleUpdateBrandVariant(idx, "brand", e.target.value)}
                          className="h-8 text-sm"
                          required={!variant.existing}
                          disabled={variant.existing}
                        />
                      </td>
                      <td className="px-6 py-3">
                        <Input
                          placeholder="e.g. RC0603JR-0710KL"
                          value={variant.partNo}
                          onChange={(e) => handleUpdateBrandVariant(idx, "partNo", e.target.value)}
                          className="h-8 text-sm"
                          required={!variant.existing}
                          disabled={variant.existing}
                        />
                      </td>
                      <td className="px-6 py-3">
                        <Input
                          type="number"
                          placeholder="e.g. 1000"
                          value={variant.stock}
                          onChange={(e) => handleUpdateBrandVariant(idx, "stock", e.target.value)}
                          className="h-8 text-sm"
                          disabled={variant.existing}
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        {variant.existing ? (
                          <span className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground/60" title="Existing variant — managed on the details page">
                            <Lock className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveBrandVariant(idx)}
                            className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all rounded-lg"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {brandVariants.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                        <Award className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2 stroke-1" />
                        No manufacturer variants mapped. Click &quot;Add Variant&quot; to map a manufacturer.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Specifications */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="bg-muted/10 border-b border-border/60 py-4 px-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold text-foreground">Section 4 — Technical Specifications</CardTitle>
                <CardDescription>Future-proof key-value specifications matrix</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddSpecification}
                className="gap-1 border-border font-bold hover:bg-primary/5 hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Specification</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-sm text-left text-foreground">
                <thead className="text-[10px] uppercase bg-muted/40 text-muted-foreground border-b border-border">
                  <tr>
                    <th scope="col" className="px-6 py-3 font-bold w-1/2">Specification Key</th>
                    <th scope="col" className="px-6 py-3 font-bold w-1/2">Specification Value</th>
                    <th scope="col" className="px-3 py-3 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-background">
                  {specifications.map((spec, idx) => (
                    <tr key={idx} className="hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-3">
                        <Input
                          placeholder="e.g. Tolerance, Power Rating, Voltage"
                          value={spec.key}
                          onChange={(e) => handleUpdateSpecification(idx, "key", e.target.value)}
                          className="h-8 text-sm"
                          required
                        />
                      </td>
                      <td className="px-6 py-3">
                        <Input
                          placeholder="e.g. ±5%, 0.25W, 50V"
                          value={spec.value}
                          onChange={(e) => handleUpdateSpecification(idx, "value", e.target.value)}
                          className="h-8 text-sm"
                          required
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveSpecification(idx)}
                          className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all rounded-lg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {specifications.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">
                        <Cpu className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2 stroke-1" />
                        No specifications defined. Click &quot;Add Specification&quot; to add details.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <Button type="button" variant="outline" render={<Link href={cancelHref} />} className="font-bold border-border">
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="font-bold bg-primary hover:bg-primary/90 text-primary-foreground min-w-[120px]"
          >
            {isSubmitting ? "Saving..." : isEdit ? "Save Changes" : "Save Item"}
          </Button>
        </div>
      </form>
    </div>
  )
}
