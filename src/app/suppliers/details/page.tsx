"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Truck, ArrowLeft, Mail, Phone, MapPin, ShoppingBag, PackageOpen, Award, Layers, Star, Plus, X, Check, AlertCircle } from "lucide-react"
import Link from "next/link"
import { StatStrip } from "@/components/stat-strip"
import { useData } from "@/lib/data-provider"
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

  const d = useData()
  const DEFAULT_SUPPLIERS = React.useMemo(() => buildDefaultSuppliers(d), [d])

  const [suppliers, setSuppliers] = React.useState<Record<string, SupplierData>>(DEFAULT_SUPPLIERS)
  const [mounted, setMounted] = React.useState(false)
  const [showAddModal, setShowAddModal] = React.useState(false)
  const [toast, setToast] = React.useState<{ message: string; type: "success" | "error" } | null>(null)

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

  // Keep the local view model in sync with the backend data (re-derives after d.reload()).
  React.useEffect(() => {
    setSuppliers(DEFAULT_SUPPLIERS)
  }, [DEFAULT_SUPPLIERS])

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
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
            <Button variant="outline" render={<Link href="/suppliers/list" />} className="gap-2 border-border bg-background">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Supplier List</span>
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
      showToast(body?.error?.message || "Failed to save price", "error")
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <span>Suppliers</span>
            <span>/</span>
            <span>Supplier List</span>
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
          render={<Link href="/suppliers/list" />}
          className="gap-2 self-start sm:self-auto border-border bg-background cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to List</span>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {supplier.parts.map((part, idx) => (
                    <tr key={idx} className="hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-4">
                        <Link 
                          href={`/components/details?component=${part.partId}`}
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
                    </tr>
                  ))}
                  {supplier.parts.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
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
