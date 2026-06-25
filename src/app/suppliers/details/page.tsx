"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Truck, ArrowLeft, Mail, Phone, MapPin, ShoppingBag, PackageOpen, Award, Layers, Star, Plus, X, Check, AlertCircle } from "lucide-react"
import Link from "next/link"

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

const DEFAULT_SUPPLIERS: Record<string, SupplierData> = {
  "abc-electronics": {
    id: "abc-electronics",
    name: "ABC Electronics",
    description: "Elite components distributor and logistics partner",
    contact: "Rajesh Kumar",
    email: "contact@abcelectronics.in",
    phone: "+91 80 4912 3456",
    address: "Plot 42, Electronic City Phase 1, Bangalore, Karnataka, India",
    terms: "Net 30",
    activeOrders: 3,
    componentsSupplied: 250,
    brandsSupported: 12,
    productsImpacted: 15,
    parts: [
      { partId: "resistor-10k", partName: "Resistor 10K", brandId: "yageo", brandName: "Yageo", price: "₹0.80", leadTime: "3 Days" },
      { partId: "capacitor-100uf", partName: "Capacitor 100uF", brandId: "yageo", brandName: "Yageo", price: "₹1.20", leadTime: "3 Days" },
      { partId: "led-green", partName: "LED Green", brandId: "panasonic", brandName: "Panasonic", price: "₹2.00", leadTime: "10 Days" },
    ],
  },
  "xyz-components": {
    id: "xyz-components",
    name: "XYZ Components",
    description: "Bulk electronic component vendor and direct importer",
    contact: "Sarah Jenkins",
    email: "sales@xyzcomponents.com",
    phone: "+1 (555) 762-0981",
    address: "85 Circuit Boulevard, Suite 300, Chicago, IL, USA",
    terms: "Net 45",
    activeOrders: 1,
    componentsSupplied: 180,
    brandsSupported: 8,
    productsImpacted: 10,
    parts: [
      { partId: "resistor-10k", partName: "Resistor 10K", brandId: "yageo", brandName: "Yageo", price: "₹0.82", leadTime: "2 Days" },
      { partId: "led-green", partName: "LED Green", brandId: "lite-on", brandName: "Lite-On", price: "₹2.10", leadTime: "4 Days" },
      { partId: "capacitor-100uf", partName: "Capacitor 100uF", brandId: "murata", brandName: "Murata", price: "₹1.45", leadTime: "4 Days" },
    ],
  },
  "powertech": {
    id: "powertech",
    name: "PowerTech",
    description: "High-reliability industrial power electronics and passives",
    contact: "Marc DuPont",
    email: "support@powertech-ind.eu",
    phone: "+33 1 42 68 53 00",
    address: "12 Rue de la Technology, Paris, France",
    terms: "Net 15",
    activeOrders: 2,
    componentsSupplied: 120,
    brandsSupported: 6,
    productsImpacted: 8,
    parts: [
      { partId: "resistor-10k", partName: "Resistor 10K", brandId: "vishay", brandName: "Vishay", price: "₹0.95", leadTime: "7 Days" },
      { partId: "capacitor-100uf", partName: "Capacitor 100uF", brandId: "nichicon", brandName: "Nichicon", price: "₹1.50", leadTime: "2 Days" },
    ],
  },
  "semiconductors-corp": {
    id: "semiconductors-corp",
    name: "Semiconductors Corp",
    description: "Primary distributor of ICs and microcontrollers",
    contact: "Jane Doe",
    email: "orders@semiconductorscorp.com",
    phone: "+1 (555) 123-4567",
    address: "100 Silicon Way, San Jose, CA, USA",
    terms: "Net 30",
    activeOrders: 2,
    componentsSupplied: 95,
    brandsSupported: 5,
    productsImpacted: 12,
    parts: [
      { partId: "audio-codec", partName: "Audio Codec", brandId: "texas-instruments", brandName: "Texas Instruments", price: "₹125.00", leadTime: "5 Days" },
      { partId: "gsm-chip", partName: "GSM Chip", brandId: "quectel", brandName: "Quectel", price: "₹375.00", leadTime: "7 Days" },
    ],
  },
  "led-depot": {
    id: "led-depot",
    name: "LED Depot",
    description: "Supplier of LEDs and optoelectronics components",
    contact: "John Smith",
    email: "sales@leddepot.com",
    phone: "+1 (555) 987-6543",
    address: "450 Bright Ave, Austin, TX, USA",
    terms: "Net 15",
    activeOrders: 1,
    componentsSupplied: 40,
    brandsSupported: 3,
    productsImpacted: 6,
    parts: [
      { partId: "led-green", partName: "LED Green", brandId: "everlight", brandName: "Everlight", price: "₹2.20", leadTime: "2 Days" },
    ],
  },
  "fastpcbs-ltd": {
    id: "fastpcbs-ltd",
    name: "FastPCBs Ltd",
    description: "PCB fabrication and layout prototyping services",
    contact: "Alice Johnson",
    email: "pcb@fastpcbs.co.uk",
    phone: "+44 20 7946 0958",
    address: "78 Circuit Lane, London, UK",
    terms: "Due on Receipt",
    activeOrders: 0,
    componentsSupplied: 15,
    brandsSupported: 2,
    productsImpacted: 5,
    parts: [
      { partId: "audio-pcb", partName: "Audio PCB Fab", brandId: "fastpcbs", brandName: "FastPCBs", price: "₹410.00", leadTime: "3 Days" },
      { partId: "gsm-pcb", partName: "GSM PCB Fab", brandId: "fastpcbs", brandName: "FastPCBs", price: "₹530.00", leadTime: "3 Days" },
    ],
  },
}

function SupplierDetailsContent() {
  const searchParams = useSearchParams()
  const supplierId = searchParams.get("supplier") || "abc-electronics"

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

  const componentOptions = [
    { id: "resistor-10k", name: "Resistor 10K" },
    { id: "capacitor-100uf", name: "Capacitor 100uF" },
    { id: "led-green", name: "LED Green" },
  ]

  const brandOptions = [
    { id: "yageo", name: "Yageo" },
    { id: "vishay", name: "Vishay" },
    { id: "panasonic", name: "Panasonic" },
    { id: "murata", name: "Murata" },
  ]

  React.useEffect(() => {
    setMounted(true)
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mockup2_erp_suppliers_details")
      if (saved) {
        try {
          setSuppliers(JSON.parse(saved))
        } catch (e) {
          console.error("Failed to parse supplier data", e)
        }
      }
    }
  }, [])

  const saveToLocalStorage = (newData: Record<string, SupplierData>) => {
    setSuppliers(newData)
    if (typeof window !== "undefined") {
      localStorage.setItem("mockup2_erp_suppliers_details", JSON.stringify(newData))
    }
  }

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const supplier = suppliers[supplierId] || suppliers["abc-electronics"] || DEFAULT_SUPPLIERS["abc-electronics"]

  const handleAddPart = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPrice.trim() || !newLeadTime.trim()) {
      showToast("Please fill in all pricing fields", "error")
      return
    }

    if (supplier.parts.some(p => p.partId === newPartId && p.brandId === newBrandId)) {
      showToast("This exact part and brand is already registered for this supplier", "error")
      return
    }

    const priceVal = parseFloat(newPrice)
    const formattedPrice = isNaN(priceVal) ? "₹1.00" : `₹${priceVal.toFixed(2)}`
    const leadTimeStr = newLeadTime.toLowerCase().includes("day") ? newLeadTime : `${newLeadTime} Days`

    const newPart: SupplyItem = {
      partId: newPartId,
      partName: newPartName,
      brandId: newBrandId,
      brandName: newBrandName,
      price: formattedPrice,
      leadTime: leadTimeStr
    }

    const updatedSupplier = {
      ...supplier,
      componentsSupplied: supplier.componentsSupplied + 1,
      parts: [...supplier.parts, newPart]
    }

    const updated = {
      ...suppliers,
      [supplier.id]: updatedSupplier
    }

    saveToLocalStorage(updated)
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

      {/* Summary KPI Stats Row */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Components Supplied Card */}
        <Card className="border border-border shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 h-16 w-16 -mr-3 -mt-3 rounded-full bg-primary/5 transition-transform group-hover:scale-110" />
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Components Supplied</CardTitle>
          </CardHeader>
          <CardContent className="flex items-baseline justify-between pt-1">
            <span className="text-3xl font-black text-foreground tracking-tight">{supplier.componentsSupplied.toLocaleString()}</span>
            <span className="text-xs font-semibold text-muted-foreground uppercase">Items</span>
          </CardContent>
          <CardContent className="pt-0">
            <span className="text-xs text-muted-foreground">Active supply parts in catalog</span>
          </CardContent>
        </Card>

        {/* Brands Supported Card */}
        <Card className="border border-border shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 h-16 w-16 -mr-3 -mt-3 rounded-full bg-primary/5 transition-transform group-hover:scale-110" />
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Brands Supported</CardTitle>
          </CardHeader>
          <CardContent className="flex items-baseline justify-between pt-1">
            <span className="text-3xl font-black text-foreground tracking-tight">{supplier.brandsSupported.toLocaleString()}</span>
            <span className="text-xs font-semibold text-muted-foreground uppercase">Brands</span>
          </CardContent>
          <CardContent className="pt-0">
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
              Authorized manufacturing lines
            </span>
          </CardContent>
        </Card>

        {/* Products Impacted Card */}
        <Card className="border border-border shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 h-16 w-16 -mr-3 -mt-3 rounded-full bg-primary/5 transition-transform group-hover:scale-110" />
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Products Impacted</CardTitle>
          </CardHeader>
          <CardContent className="flex items-baseline justify-between pt-1">
            <span className="text-3xl font-black text-foreground tracking-tight">{supplier.productsImpacted.toLocaleString()}</span>
            <span className="text-xs font-semibold text-muted-foreground uppercase">Products</span>
          </CardContent>
          <CardContent className="pt-0">
            <span className="text-xs text-muted-foreground">Downstream assemblies dependent</span>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Side: Supplied Parts Catalog */}
        <Card className="lg:col-span-2 border border-border shadow-sm overflow-hidden">
          <CardHeader className="border-b border-border bg-muted/20 px-6 py-4 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <PackageOpen className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg font-bold">Components Sold</CardTitle>
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
              <span>Map Component</span>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-foreground">
                <thead className="text-xs uppercase bg-muted/40 text-muted-foreground border-b border-border">
                  <tr>
                    <th scope="col" className="px-6 py-3 font-semibold">Component</th>
                    <th scope="col" className="px-6 py-3 font-semibold">Brand</th>
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
                        No active components supplied by this vendor.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
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
              <h3 className="text-lg font-bold text-foreground">Map Component & Brand</h3>
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
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Component</label>
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
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Manufacturer Brand</label>
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
                <Button type="submit">Map Component</Button>
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
