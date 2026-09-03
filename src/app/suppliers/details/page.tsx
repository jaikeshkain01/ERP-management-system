"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Truck, ArrowLeft, Mail, Phone, MapPin, ShoppingBag, PackageOpen, Award, Layers, Star, Plus, X, Check, AlertCircle, Trash2 } from "lucide-react"
import Link from "next/link"
import { StatStrip } from "@/components/stat-strip"
import { useData } from "@/lib/data-provider"
import { useModules } from "@/components/module-provider"
import { isWorkspaceReachable, workspaceById } from "@/lib/modules"
import { extractError } from "@/lib/api-error"
import { DragScrollArea } from "@/components/ui/drag-scroll-area"

interface SupplyItem {
  partId: string
  partName: string
  brandId: string
  brandName: string
  price: string
  leadTime: string
}

interface SupplierData {
  id: string
  name: string
  description: string
  contact: string
  email: string
  phone: string
  address: string
  terms: string
  activeOrders: number
  componentsSupplied: number
  brandsSupported: number
  productsImpacted: number
  parts: SupplyItem[]
}

// Seed derived from the centralized store — supplier profiles plus the parts
// they offer, joined from each component's offers. Price edits POST to the
// backend price book (forms below); the view re-derives from live data.
function buildDefaultSuppliers(d: ReturnType<typeof useData>): Record<string, SupplierData> {
  return Object.fromEntries(
    d.SUPPLIERS.map((s) => {
      const parts: SupplyItem[] = []
      d.COMPONENTS.forEach((c) =>
        c.offers
          .filter((o) => o.supplierId === s.id)
          .forEach((o) =>
            parts.push({
              partId: c.id,
              partName: c.name,
              brandId: o.brandId,
              brandName: d.getBrandName(o.brandId),
              price: d.formatINR(o.price),
              leadTime: d.formatLeadTime(o.leadTimeDays),
            }),
          ),
      )
      const impactedProducts = new Set<string>()
      d.supplierComponents(s.id).forEach((c) =>
        d.productsUsingComponent(c.id).forEach((p) => impactedProducts.add(p.id)),
      )
      return [
        s.id,
        {
          id: s.id,
          name: s.name,
          description: s.description,
          contact: s.contact,
          email: s.email,
          phone: s.phone,
          address: s.address,
          terms: s.terms,
          activeOrders: impactedProducts.size,
          componentsSupplied: parts.length,
          brandsSupported: d.supplierBrandIds(s.id).length,
          productsImpacted: impactedProducts.size,
          parts,
        } satisfies SupplierData,
      ]
    }),
  )
}

function SupplierDetailsContent() {
  const searchParams = useSearchParams()
  const supplierId = searchParams.get("supplier") || "abc-electronics"

  // Origin workspace hint — keeps the breadcrumb + Back button pointing at the
  // page the user came from (Purchases, Products, PCB Structure) rather than
  // silently sending them to the Supplier List. A hint whose module is locked
  // (e.g. `from=purchasing` after the user loses that license) is ignored so
  // the Back button never dead-ends on a lock screen.
  const { isEnabled } = useModules()
  const fromParam = searchParams.get("from")
  const from = isWorkspaceReachable(workspaceById(fromParam), isEnabled) ? fromParam : null
  const back = (() => {
    switch (from) {
      case "purchasing": return { href: "/purchases/requests", label: "Back to Purchase Requests", crumb: "Purchases", crumbLabel: "Purchase Requests" }
      case "products":   return { href: "/items/list?itemType=assembled", label: "Back to Assembled Products", crumb: "Assembled Products", crumbLabel: "List" }
      case "pcb":        return { href: "/items/list?itemType=semi_assembled", label: "Back to Semi-assembled", crumb: "Semi-assembled", crumbLabel: "List" }
      default:           return { href: "/suppliers/list", label: "Back to Supplier List", crumb: "Suppliers", crumbLabel: "Supplier List" }
    }
  })()

  const d = useData()
  const DEFAULT_SUPPLIERS = React.useMemo(() => buildDefaultSuppliers(d), [d])

  const [suppliers, setSuppliers] = React.useState<Record<string, SupplierData>>(DEFAULT_SUPPLIERS)
  const [mounted, setMounted] = React.useState(false)
  const [showAddModal, setShowAddModal] = React.useState(false)
  const [toast, setToast] = React.useState<{ message: string; hint?: string; type: "success" | "error" } | null>(null)
  // Live price-book row ids, keyed `${genericPN}|${brandSlug}` — needed to delete a row.
  const [priceIds, setPriceIds] = React.useState<Map<string, string>>(new Map())
  const [deletePart, setDeletePart] = React.useState<SupplyItem | null>(null)
  const [deletingPrice, setDeletingPrice] = React.useState(false)

  const loadPriceIds = React.useCallback(async (sid: string) => {
    const res = await fetch(`/api/suppliers/${sid}/prices`, { cache: "no-store" })
    const body = await res.json().catch(() => null)
    const map = new Map<string, string>()
    if (res.ok && Array.isArray(body?.data)) {
      for (const p of body.data as { id: string; genericPN: string; brandSlug: string }[]) {
        map.set(`${p.genericPN}|${p.brandSlug}`, p.id)
      }
    }
    setPriceIds(map)
  }, [])

  // Map Component Form State
  const [newPartId, setNewPartId] = React.useState("resistor-10k")
  const [newPartName, setNewPartName] = React.useState("Resistor 10K")
  const [newBrandId, setNewBrandId] = React.useState("yageo")
  const [newBrandName, setNewBrandName] = React.useState("Yageo")
  const [newPrice, setNewPrice] = React.useState("")
  const [newLeadTime, setNewLeadTime] = React.useState("")

  const componentOptions = d.COMPONENTS.map((c) => ({ id: c.id, name: c.name }))
  const brandOptions = d.BRANDS.map((b) => ({ id: b.id, name: b.name }))

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    if (supplierId) loadPriceIds(supplierId)
  }, [supplierId, loadPriceIds])

  // Keep the local view model in sync with the backend data (re-derives after d.reload()).
  React.useEffect(() => {
    setSuppliers(DEFAULT_SUPPLIERS)
  }, [DEFAULT_SUPPLIERS])

  const showToast = (msgOrInfo: string | { message: string; hint?: string }, type: "success" | "error" = "success") => {
    const info = typeof msgOrInfo === "string" ? { message: msgOrInfo } : msgOrInfo
    setToast({ ...info, type })
    setTimeout(() => setToast(null), type === "error" ? 6000 : 3000)
  }

  const supplier = suppliers[supplierId] || suppliers["abc-electronics"] || DEFAULT_SUPPLIERS["abc-electronics"]

  // No supplier for this id (e.g. empty directory / stale link) → empty state instead
  // of crashing on supplier.name below.
  if (!supplier) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <span>Suppliers</span>
            <span>/</span>
            <span className="text-foreground font-medium">Supplier Details</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Supplier Details</h1>
        </div>
        <Card className="border border-border shadow-sm">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Truck className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-bold text-foreground">No supplier to display</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                There are no suppliers in the system yet. Add a supplier to view its profile and price agreements.
              </p>
            </div>
            <Button variant="outline" render={<Link href={back.href} />} className="gap-2 border-border bg-background">
              <ArrowLeft className="h-4 w-4" />
              <span>{back.label}</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleAddPart = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPrice.trim() || !newLeadTime.trim()) {
      showToast("Please fill in all pricing fields", "error")
      return
    }

    if (supplier.parts.some(p => p.partId === newPartId && p.brandId === newBrandId)) {
      showToast("This exact part and manufacturer is already registered for this supplier", "error")
      return
    }

    const priceVal = parseFloat(newPrice)
    if (isNaN(priceVal) || priceVal <= 0) {
      showToast("Price must be a valid positive number", "error")
      return
    }
    const leadDays = parseInt(newLeadTime.replace(/[^\d]/g, ""), 10)

    // Persist to the price book, then reflect it optimistically.
    const res = await fetch(`/api/suppliers/${supplier.id}/prices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        component: newPartId,
        brand: newBrandId,
        price: priceVal,
        ...(isNaN(leadDays) ? {} : { leadTimeDays: leadDays }),
      }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      showToast(extractError(body, "Failed to save price"), "error")
      return
    }

    const newPart: SupplyItem = {
      partId: newPartId,
      partName: newPartName,
      brandId: newBrandId,
      brandName: newBrandName,
      price: d.formatINR(priceVal),
      leadTime: d.formatLeadTime(isNaN(leadDays) ? 0 : leadDays),
    }
    setSuppliers({
      ...suppliers,
      [supplier.id]: { ...supplier, componentsSupplied: supplier.componentsSupplied + 1, parts: [...supplier.parts, newPart] },
    })
    setNewPrice("")
    setNewLeadTime("")
    setShowAddModal(false)
    showToast(`Successfully registered ${newPart.partName} (${newPart.brandName})!`)
    loadPriceIds(supplier.id) // pick up the new row's id so it becomes deletable
  }

  const handleDeletePrice = async () => {
    if (!deletePart) return
    const priceId = priceIds.get(`${deletePart.partId}|${deletePart.brandId}`)
    if (!priceId) {
      showToast("Couldn't resolve this price row — refresh and try again", "error")
      setDeletePart(null)
      return
    }
    setDeletingPrice(true)
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}/prices/${priceId}`, { method: "DELETE" })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        showToast(extractError(body, "Failed to remove price"), "error")
        return
      }
      setDeletePart(null)
      await d.reload() // re-derive the parts table from the catalog offers
      await loadPriceIds(supplier.id)
      showToast(`Removed ${deletePart.partName} (${deletePart.brandName}) from the price book`)
    } finally {
      setDeletingPrice(false)
    }
  }

  if (!mounted) {
    return (
      <div className="flex h-[400px] items-center justify-center text-muted-foreground text-sm font-medium">
        Loading supplier details...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-[70] max-w-md flex items-start gap-2 px-4 py-3 rounded-lg border shadow-lg transition-all animate-in fade-in slide-in-from-bottom-5 duration-300 bg-background ${
          toast.type === "success"
            ? "border-emerald-500/35 text-emerald-600 dark:text-emerald-400"
            : "border-destructive/35 text-destructive"
        }`}>
          {toast.type === "success"
            ? <Check className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
            : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
          <div className="min-w-0">
            <div className="text-sm font-semibold">{toast.message}</div>
            {toast.hint && <div className="mt-1 text-xs font-medium text-muted-foreground">{toast.hint}</div>}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <span>{back.crumb}</span>
            <span>/</span>
            <Link href={back.href} className="hover:text-foreground transition-colors">{back.crumbLabel}</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Details</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Supplier Details</h1>
          <p className="text-muted-foreground">
            Vendor catalog price points and contact logistics.
          </p>
        </div>
        <Button
          variant="outline"
          render={<Link href={back.href} />}
          className="gap-2 self-start sm:self-auto border-border bg-background cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{back.label}</span>
        </Button>
      </div>

      {/* Summary KPI readout — instrument strip */}
      <StatStrip
        items={[
          { label: "Items Supplied", value: supplier.componentsSupplied.toLocaleString(), desc: "Active supply parts in catalog", icon: PackageOpen },
          { label: "Manufacturers Supported", value: supplier.brandsSupported.toLocaleString(), desc: "Authorized manufacturing lines", icon: Award },
          { label: "Products Impacted", value: supplier.productsImpacted.toLocaleString(), desc: "Downstream assemblies dependent", icon: Layers },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Side: Supplied Parts Catalog */}
        <Card className="lg:col-span-2 border border-border shadow-sm overflow-hidden">
          <CardHeader className="border-b border-border bg-muted/20 px-6 py-4 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <PackageOpen className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg font-bold">Items Sold</CardTitle>
                <CardDescription>BOM pricing structures from {supplier.name}</CardDescription>
              </div>
            </div>
            <Button 
              size="sm" 
              className="font-bold gap-1 cursor-pointer"
              onClick={() => {
                setNewPrice("")
                setNewLeadTime("")
                setShowAddModal(true)
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Map Item</span>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <DragScrollArea className="overflow-x-auto">
              <table className="w-full text-sm text-left text-foreground">
                <thead className="text-xs uppercase bg-muted/40 text-muted-foreground border-b border-border">
                  <tr>
                    <th scope="col" className="px-6 py-3 font-semibold">Item</th>
                    <th scope="col" className="px-6 py-3 font-semibold">Manufacturer</th>
                    <th scope="col" className="px-6 py-3 font-semibold">Price</th>
                    <th scope="col" className="px-6 py-3 text-right">Lead Time</th>
                    <th scope="col" className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {supplier.parts.map((part, idx) => (
                    <tr key={idx} className="hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-4">
                        <Link
                          href={`/items/details/${part.partId}?from=suppliers`}
                          className="font-semibold text-primary hover:underline"
                        >
                          {part.partName}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={`/brands/list?brand=${part.brandId}`}
                          className="font-semibold text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {part.brandName}
                        </Link>
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-primary">{part.price}</td>
                      <td className="px-6 py-4 font-mono text-right text-muted-foreground">{part.leadTime}</td>
                      <td className="px-6 py-4 text-right">
                        {priceIds.has(`${part.partId}|${part.brandId}`) ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title="Remove price"
                            onClick={() => setDeletePart(part)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/50">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {supplier.parts.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                        No active items supplied by this vendor.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </DragScrollArea>
          </CardContent>
        </Card>

        {/* Right Side: Supplier Profile Info */}
        <div className="space-y-6">
          <Card className="border border-border shadow-sm sticky top-6">
            <CardHeader className="border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg font-bold">Supplier Information</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-bold">Supplier Name</span>
                  <span className="text-lg font-extrabold text-foreground">{supplier.name}</span>
                  <span className="text-xs text-muted-foreground leading-relaxed mt-1">{supplier.description}</span>
                </div>

                <div className="flex flex-col gap-1 border-t border-border/50 pt-3">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Account Manager</span>
                  <span className="text-sm font-semibold text-foreground">{supplier.contact}</span>
                </div>

                <div className="flex flex-col gap-3 border-t border-border/50 pt-3">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold block">Contact Info</span>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2.5">
                      <Mail className="h-4 w-4 text-muted-foreground/60" />
                      <span className="truncate font-semibold">{supplier.email}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Phone className="h-4 w-4 text-muted-foreground/60" />
                      <span className="font-semibold">{supplier.phone}</span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <MapPin className="h-4 w-4 text-muted-foreground/60 mt-0.5" />
                      <span className="leading-snug font-semibold">{supplier.address}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-border/50 pt-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Payment Terms</span>
                    <span className="font-bold text-foreground text-sm">{supplier.terms}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Active Orders</span>
                    <span className="inline-flex items-center gap-1.5 font-bold text-foreground text-sm">
                      <ShoppingBag className="h-4 w-4 text-primary" />
                      {supplier.activeOrders}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Map Component Modal */}
      {/* Remove price confirm */}
      {deletePart && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => !deletingPrice && setDeletePart(null)}
        >
          <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border bg-muted/20 px-6 py-4">
              <h3 className="text-lg font-bold text-foreground">Remove Price</h3>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" onClick={() => setDeletePart(null)} disabled={deletingPrice}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/25 p-3 rounded-xl text-destructive text-xs leading-relaxed font-semibold">
                <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
                <p>Remove the price for <strong>{deletePart.partName} ({deletePart.brandName})</strong> from this supplier's price book?</p>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-border/50">
                <Button type="button" variant="outline" onClick={() => setDeletePart(null)} disabled={deletingPrice}>Cancel</Button>
                <Button type="button" onClick={handleDeletePrice} disabled={deletingPrice} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold min-w-[110px]">
                  {deletingPrice ? "Removing…" : "Remove Price"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setShowAddModal(false)}
        >
          <div 
            className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden scale-100 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border bg-muted/20 px-6 py-4">
              <h3 className="text-lg font-bold text-foreground">Map Item & Manufacturer</h3>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-full border-0 bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setShowAddModal(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleAddPart} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Item</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  value={newPartId}
                  onChange={(e) => {
                    setNewPartId(e.target.value)
                    const opt = componentOptions.find(o => o.id === e.target.value)
                    if (opt) setNewPartName(opt.name)
                  }}
                >
                  {componentOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Manufacturer</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  value={newBrandId}
                  onChange={(e) => {
                    setNewBrandId(e.target.value)
                    const opt = brandOptions.find(o => o.id === e.target.value)
                    if (opt) setNewBrandName(opt.name)
                  }}
                >
                  {brandOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unit Price (₹)</label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    placeholder="e.g. 1.20" 
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lead Time (Days)</label>
                  <Input 
                    placeholder="e.g. 5" 
                    value={newLeadTime}
                    onChange={(e) => setNewLeadTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-border/40 pt-4 mt-2">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
                <Button type="submit">Map Item</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SupplierDetailsPage() {
  return (
    <React.Suspense fallback={
      <div className="flex h-[400px] items-center justify-center text-muted-foreground text-sm font-medium">
        Loading supplier details...
      </div>
    }>
      <SupplierDetailsContent />
    </React.Suspense>
  )
}
