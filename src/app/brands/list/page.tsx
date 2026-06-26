"use client"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertCircle, CheckCircle2, Award, Filter, Plus, Search, Layers, ShieldCheck, Landmark, Star, X, Check, ArrowRight, MapPin, Calendar, Clock, Sparkles } from "lucide-react"
import Link from "next/link"
import {
  BRANDS, SUPPLIERS, COMPONENTS, getSupplier, brandComponents,
  componentStockStatus, formatINR, formatLeadTime,
} from "@/mockdata"

// Types
interface AssociatedComponent {
  id: string
  displayName: string
  category: string
  stock: number
  status: "Healthy" | "Low"
}

interface AssociatedSupplier {
  id: string
  name: string
  price: string
  moq: number
  leadTime: string
  rating: number
}

interface BrandData {
  id: string
  name: string
  description: string
  headquarter: string
  founded: string
  status: "Approved" | "Pending"
  components: AssociatedComponent[]
  suppliers: AssociatedSupplier[]
}

// Seed derived from the centralized store. Each brand's components and the
// suppliers that carry them are joined from the canonical component records.
const DEFAULT_BRANDS: Record<string, BrandData> = Object.fromEntries(
  BRANDS.map((b) => {
    const comps = brandComponents(b.id)
    const components: AssociatedComponent[] = comps.map((c) => ({
      id: c.id,
      displayName: c.name,
      category: c.category,
      stock: c.stock,
      status: componentStockStatus(c) === "Healthy" ? "Healthy" : "Low",
    }))
    const supMap = new Map<string, AssociatedSupplier>()
    comps.forEach((c) =>
      c.offers
        .filter((o) => o.brandId === b.id)
        .forEach((o) => {
          if (!supMap.has(o.supplierId)) {
            const sup = getSupplier(o.supplierId)
            supMap.set(o.supplierId, {
              id: o.supplierId,
              name: sup?.name ?? o.supplierId,
              price: formatINR(o.price),
              moq: c.spq,
              leadTime: formatLeadTime(o.leadTimeDays),
              rating: sup?.rating ?? 4.5,
            })
          }
        }),
    )
    return [
      b.id,
      {
        id: b.id,
        name: b.name,
        description: b.description,
        headquarter: b.headquarter,
        founded: b.founded,
        status: b.status,
        components,
        suppliers: Array.from(supMap.values()),
      } satisfies BrandData,
    ]
  }),
)

function BrandDashboardContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [brands, setBrands] = React.useState<Record<string, BrandData>>(DEFAULT_BRANDS)
  const [mounted, setMounted] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [activeModal, setActiveModal] = React.useState<'add-brand' | 'add-component' | 'add-supplier' | null>(null)
  const [toast, setToast] = React.useState<{ message: string; type: "success" | "error" } | null>(null)

  // Add Brand Form State
  const [newBrandName, setNewBrandName] = React.useState("")
  const [newBrandDesc, setNewBrandDesc] = React.useState("")
  const [newBrandHQ, setNewBrandHQ] = React.useState("")
  const [newBrandFounded, setNewBrandFounded] = React.useState("")
  const [newBrandStatus, setNewBrandStatus] = React.useState<"Approved" | "Pending">("Approved")

  // Add Component State
  const [newCompId, setNewCompId] = React.useState("resistor-10k")
  const [newCompName, setNewCompName] = React.useState("Resistor 10K")
  const [newCompCategory, setNewCompCategory] = React.useState("Resistor")
  const [newCompStock, setNewCompStock] = React.useState("1000")
  const [newCompStatus, setNewCompStatus] = React.useState<"Healthy" | "Low">("Healthy")

  // Add Supplier State
  const [newSupName, setNewSupName] = React.useState("abc-electronics")
  const [newSupPrice, setNewSupPrice] = React.useState("")
  const [newSupMOQ, setNewSupMOQ] = React.useState("")
  const [newSupLead, setNewSupLead] = React.useState("")

  const supplierOptions = SUPPLIERS.map((s) => ({ id: s.id, name: s.name, rating: s.rating }))

  const componentOptions = COMPONENTS.map((c) => ({
    id: c.id,
    displayName: c.name,
    category: c.category,
  }))

  // Sync state with localStorage on mount
  React.useEffect(() => {
    setMounted(true)
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mockup2_erp_brands_data")
      if (saved) {
        try {
          setBrands(JSON.parse(saved))
        } catch (e) {
          console.error("Failed to parse brand data", e)
        }
      }
    }
  }, [])

  const saveToLocalStorage = (newData: Record<string, BrandData>) => {
    setBrands(newData)
    if (typeof window !== "undefined") {
      localStorage.setItem("mockup2_erp_brands_data", JSON.stringify(newData))
    }
  }

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const selectedId = searchParams.get("brand") || "yageo"
  const selectedBrand = brands[selectedId] || brands["yageo"] || DEFAULT_BRANDS["yageo"]

  const handleRowClick = (id: string) => {
    const params = new URLSearchParams(window.location.search)
    params.set("brand", id)
    router.push(`?${params.toString()}`, { scroll: false })
  }

  const handleAddBrand = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBrandName.trim() || !newBrandDesc.trim() || !newBrandHQ.trim() || !newBrandFounded.trim()) {
      showToast("Please fill all brand fields", "error")
      return
    }

    const brandKey = newBrandName.trim().toLowerCase().replace(/\s+/g, "-")

    if (brands[brandKey]) {
      showToast("A brand with this name already exists", "error")
      return
    }

    const newBrand: BrandData = {
      id: brandKey,
      name: newBrandName.trim(),
      description: newBrandDesc.trim(),
      headquarter: newBrandHQ.trim(),
      founded: newBrandFounded.trim(),
      status: newBrandStatus,
      components: [],
      suppliers: []
    }

    const updated = {
      ...brands,
      [brandKey]: newBrand
    }

    saveToLocalStorage(updated)
    setNewBrandName("")
    setNewBrandDesc("")
    setNewBrandHQ("")
    setNewBrandFounded("")
    setNewBrandStatus("Approved")
    setActiveModal(null)
    showToast(`Brand "${newBrand.name}" registered successfully!`)
    handleRowClick(brandKey)
  }

  const handleAddComponent = (e: React.FormEvent) => {
    e.preventDefault()
    const targetBrand = selectedBrand

    // Check if component already exists in selected brand components
    if (targetBrand.components.some(c => c.id === newCompId)) {
      showToast("This component is already associated with this brand", "error")
      return
    }

    const matchedOpt = componentOptions.find(c => c.id === newCompId)
    const dispName = matchedOpt ? matchedOpt.displayName : newCompName
    const catName = matchedOpt ? matchedOpt.category : newCompCategory

    const newComp: AssociatedComponent = {
      id: newCompId,
      displayName: dispName,
      category: catName,
      stock: parseInt(newCompStock) || 0,
      status: newCompStatus
    }

    const updatedBrand = {
      ...targetBrand,
      components: [...targetBrand.components, newComp]
    }

    const updated = {
      ...brands,
      [targetBrand.id]: updatedBrand
    }

    saveToLocalStorage(updated)
    setNewCompStock("1000")
    setActiveModal(null)
    showToast(`Component "${newComp.displayName}" linked to ${targetBrand.name}`)
  }

  const handleAddSupplier = (e: React.FormEvent) => {
    e.preventDefault()
    const targetBrand = selectedBrand

    // Check if supplier is already linked to this brand
    if (targetBrand.suppliers.some(s => s.id === newSupName)) {
      showToast("This supplier is already mapped to this brand", "error")
      return
    }

    const matchedSup = supplierOptions.find(s => s.id === newSupName)
    const displayName = matchedSup ? matchedSup.name : newSupName
    const rating = matchedSup ? matchedSup.rating : 4.5

    const priceVal = parseFloat(newSupPrice)
    const formattedPrice = isNaN(priceVal) ? "₹1.00" : `₹${priceVal.toFixed(2)}`
    const moqVal = parseInt(newSupMOQ) || 1000
    const leadTimeStr = newSupLead.toLowerCase().includes("day") ? newSupLead : `${newSupLead || 5} Days`

    const newSup: AssociatedSupplier = {
      id: newSupName,
      name: displayName,
      price: formattedPrice,
      moq: moqVal,
      leadTime: leadTimeStr,
      rating: rating
    }

    const updatedBrand = {
      ...targetBrand,
      suppliers: [...targetBrand.suppliers, newSup]
    }

    const updated = {
      ...brands,
      [targetBrand.id]: updatedBrand
    }

    saveToLocalStorage(updated)
    setNewSupPrice("")
    setNewSupMOQ("")
    setNewSupLead("")
    setActiveModal(null)
    showToast(`Supplier "${newSup.name}" mapped to ${targetBrand.name}`)
  }

  const filteredBrands = Object.values(brands).filter(brand =>
    brand.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    brand.headquarter.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Prevent SSR hydration mismatch
  if (!mounted) {
    return (
      <div className="flex h-[400px] items-center justify-center text-muted-foreground text-sm font-medium">
        Loading Brand Management...
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
      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <span>Brands</span>
          <span>/</span>
          <span className="text-foreground font-medium">Brand List</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Brand Management</h1>
        <p className="text-muted-foreground">
          Track approved manufacturer brands, product lineages, and procurement sources.
        </p>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-muted/20 border border-border p-4 rounded-xl">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input 
            id="brand-search"
            placeholder="Search manufacturer brands..." 
            className="pl-9 bg-background border-border"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2 border-border cursor-pointer">
            <Filter className="h-4 w-4" />
            <span>Filter</span>
          </Button>
          <Button 
            id="add-brand-btn"
            className="gap-2 font-semibold cursor-pointer"
            onClick={() => setActiveModal('add-brand')}
          >
            <Plus className="h-4 w-4" />
            <span>Add Brand</span>
          </Button>
        </div>
      </div>

      {/* Master Detail Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column - Master List */}
        <Card className="border border-border shadow-sm overflow-hidden h-fit">
          <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
            <CardTitle className="text-lg font-bold">Manufacturer Catalog</CardTitle>
            <CardDescription>Select a manufacturer brand to view detail matrix</CardDescription>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-border">
            {filteredBrands.map((b) => {
              const isSelected = b.id === selectedBrand.id
              return (
                <div
                  key={b.id}
                  onClick={() => handleRowClick(b.id)}
                  className={`flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors ${
                    isSelected ? "bg-muted/60 border-l-4 border-primary font-medium" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-extrabold text-sm uppercase">
                      {b.name.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-foreground">{b.name}</span>
                      <span className="text-xs text-muted-foreground line-clamp-1">{b.headquarter}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex flex-col items-end text-right text-[10px] text-muted-foreground font-semibold">
                      <span>{b.components.length} components</span>
                      <span>{b.suppliers.length} suppliers</span>
                    </span>
                    <ArrowRight className={`h-4 w-4 text-muted-foreground/60 transition-transform ${
                      isSelected ? "translate-x-1 text-primary" : ""
                    }`} />
                  </div>
                </div>
              )
            })}
            {filteredBrands.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No manufacturer brands match your search.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right column - Brand Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section 1: Brand Info */}
          <Card className="border border-border shadow-sm">
            <CardContent className="p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black text-2xl shadow-md">
                    {selectedBrand.name.charAt(0)}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-extrabold text-foreground">{selectedBrand.name}</h2>
                      <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-bold ${
                        selectedBrand.status === "Approved" 
                          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                          : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
                      }`}>
                        {selectedBrand.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {selectedBrand.headquarter}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        Est. {selectedBrand.founded}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-secondary/30 border border-border/50 px-3 py-1.5 rounded-lg text-xs font-semibold">
                  <Award className="h-4 w-4 text-primary" />
                  <span>Approved Manufacturer Record</span>
                </div>
              </div>

              <div className="space-y-2 border-t border-border/50 pt-4">
                <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-bold">Profile Overview</span>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {selectedBrand.description}
                </p>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-border/50 pt-4">
                <div className="bg-secondary/40 border border-border/40 p-3 rounded-lg flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Components</span>
                  <span className="text-lg font-black text-foreground">{selectedBrand.components.length}</span>
                </div>
                <div className="bg-secondary/40 border border-border/40 p-3 rounded-lg flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Suppliers</span>
                  <span className="text-lg font-black text-foreground">{selectedBrand.suppliers.length}</span>
                </div>
                <div className="bg-secondary/40 border border-border/40 p-3 rounded-lg flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Total Stock</span>
                  <span className="text-lg font-black text-foreground">
                    {selectedBrand.components.reduce((acc, c) => acc + c.stock, 0).toLocaleString()}
                  </span>
                </div>
                <div className="bg-secondary/40 border border-border/40 p-3 rounded-lg flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Status Score</span>
                  <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">98%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Associated Components */}
          <Card className="border border-border shadow-sm overflow-hidden">
            <CardHeader className="border-b border-border bg-muted/20 px-6 py-4 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-lg font-bold">Components Range</CardTitle>
                  <CardDescription>Active parts manufactured by {selectedBrand.name}</CardDescription>
                </div>
              </div>
              <Button 
                size="sm" 
                className="font-bold gap-1 cursor-pointer"
                onClick={() => {
                  setNewCompStock("1000")
                  setNewCompStatus("Healthy")
                  setActiveModal('add-component')
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Link Component</span>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-foreground">
                  <thead className="text-xs uppercase bg-muted/40 text-muted-foreground border-b border-border">
                    <tr>
                      <th scope="col" className="px-6 py-3 font-semibold">Component</th>
                      <th scope="col" className="px-6 py-3 font-semibold">Category</th>
                      <th scope="col" className="px-6 py-3 font-semibold">Current Stock</th>
                      <th scope="col" className="px-6 py-3 font-semibold">BOM Status</th>
                      <th scope="col" className="px-6 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selectedBrand.components.map((comp) => (
                      <tr key={comp.id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-6 py-3.5 font-semibold text-sm">{comp.displayName}</td>
                        <td className="px-6 py-3.5 font-mono text-xs text-muted-foreground">{comp.category}</td>
                        <td className="px-6 py-3.5 font-mono text-xs">{comp.stock.toLocaleString()} PCS</td>
                        <td className="px-6 py-3.5">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            comp.status === "Healthy" 
                              ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20" 
                              : "bg-destructive/10 text-destructive dark:bg-destructive/20"
                          }`}>
                            {comp.status}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 px-2.5 font-semibold text-xs border border-border bg-background hover:bg-muted"
                            render={<Link href={`/components/details?component=${comp.id}`} />}
                          >
                            <span>Details</span>
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {selectedBrand.components.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground text-sm">
                          No active components mapped to this brand.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Section 3: Suppliers Mapping */}
          <Card className="border border-border shadow-sm overflow-hidden">
            <CardHeader className="border-b border-border bg-muted/20 px-6 py-4 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-lg font-bold">Authorized Suppliers Matrix</CardTitle>
                  <CardDescription>Suppliers offering qualified {selectedBrand.name} parts</CardDescription>
                </div>
              </div>
              <Button 
                size="sm" 
                className="font-bold gap-1 cursor-pointer"
                onClick={() => {
                  setNewSupPrice("")
                  setNewSupMOQ("1000")
                  setNewSupLead("5")
                  setActiveModal('add-supplier')
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Map Supplier</span>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-foreground">
                  <thead className="text-xs uppercase bg-muted/40 text-muted-foreground border-b border-border">
                    <tr>
                      <th scope="col" className="px-6 py-3 font-semibold">Distributor Name</th>
                      <th scope="col" className="px-6 py-3 font-semibold">Est. Brand Pricing</th>
                      <th scope="col" className="px-6 py-3 font-semibold">MOQ</th>
                      <th scope="col" className="px-6 py-3 font-semibold">Avg. Lead Time</th>
                      <th scope="col" className="px-6 py-3 font-semibold">Rating</th>
                      <th scope="col" className="px-6 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selectedBrand.suppliers.map((sup) => (
                      <tr key={sup.id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-6 py-3.5 font-semibold text-sm">{sup.name}</td>
                        <td className="px-6 py-3.5 font-mono text-primary font-bold text-sm">{sup.price}</td>
                        <td className="px-6 py-3.5 font-mono text-xs text-muted-foreground">{sup.moq.toLocaleString()} Units</td>
                        <td className="px-6 py-3.5 font-mono text-xs flex items-center gap-1 mt-1 text-muted-foreground">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
                          <span>{sup.leadTime}</span>
                        </td>
                        <td className="px-6 py-3.5">
                          <span className="inline-flex items-center gap-1 font-semibold">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                            <span className="text-xs">{sup.rating}</span>
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 px-2.5 font-semibold text-xs border border-border bg-background hover:bg-muted"
                            render={<Link href={`/suppliers/details?supplier=${sup.id}`} />}
                          >
                            <span>Supplier Page</span>
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {selectedBrand.suppliers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground text-sm">
                          No supplier matrix entries mapped to this brand.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modals */}
      {activeModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setActiveModal(null)}
        >
          <div 
            className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden scale-100 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border bg-muted/20 px-6 py-4">
              <h3 className="text-lg font-bold text-foreground">
                {activeModal === 'add-brand' && "Register Manufacturer Brand"}
                {activeModal === 'add-component' && "Link Component Range"}
                {activeModal === 'add-supplier' && "Map Supplier Distribution Matrix"}
              </h3>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-full border-0 bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setActiveModal(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Modal Body: Add Brand */}
            {activeModal === 'add-brand' && (
              <form onSubmit={handleAddBrand} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brand Manufacturer Name</label>
                  <Input 
                    placeholder="e.g. Murata" 
                    value={newBrandName}
                    onChange={(e) => setNewBrandName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Headquarter Country/City</label>
                  <Input 
                    placeholder="e.g. Kyoto, Japan" 
                    value={newBrandHQ}
                    onChange={(e) => setNewBrandHQ(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Year Founded</label>
                    <Input 
                      placeholder="e.g. 1944" 
                      value={newBrandFounded}
                      onChange={(e) => setNewBrandFounded(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status Rating</label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      value={newBrandStatus}
                      onChange={(e) => setNewBrandStatus(e.target.value as "Approved" | "Pending")}
                    >
                      <option value="Approved">Approved</option>
                      <option value="Pending">Pending</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brand Overview Description</label>
                  <textarea 
                    className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="Overview profile, key focus areas, and compliance remarks..." 
                    value={newBrandDesc}
                    onChange={(e) => setNewBrandDesc(e.target.value)}
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 border-t border-border/40 pt-4 mt-2">
                  <Button type="button" variant="outline" onClick={() => setActiveModal(null)}>Cancel</Button>
                  <Button type="submit">Register Brand</Button>
                </div>
              </form>
            )}

            {/* Modal Body: Add Component */}
            {activeModal === 'add-component' && (
              <form onSubmit={handleAddComponent} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Component Catalog Item</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    value={newCompId}
                    onChange={(e) => {
                      setNewCompId(e.target.value)
                      const opt = componentOptions.find(o => o.id === e.target.value)
                      if (opt) {
                        setNewCompName(opt.displayName)
                        setNewCompCategory(opt.category)
                      }
                    }}
                  >
                    {componentOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.displayName} ({opt.category})</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Initial Stock (PCS)</label>
                    <Input 
                      type="number" 
                      placeholder="1000" 
                      value={newCompStock}
                      onChange={(e) => setNewCompStock(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">BOM Threshold Status</label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                      value={newCompStatus}
                      onChange={(e) => setNewCompStatus(e.target.value as "Healthy" | "Low")}
                    >
                      <option value="Healthy">Healthy</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 border-t border-border/40 pt-4 mt-2">
                  <Button type="button" variant="outline" onClick={() => setActiveModal(null)}>Cancel</Button>
                  <Button type="submit">Link Component</Button>
                </div>
              </form>
            )}

            {/* Modal Body: Add Supplier */}
            {activeModal === 'add-supplier' && (
              <form onSubmit={handleAddSupplier} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Distributor Partner</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    value={newSupName}
                    onChange={(e) => setNewSupName(e.target.value)}
                  >
                    {supplierOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.name} (★{opt.rating})</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Agreed Unit Price (₹)</label>
                    <Input 
                      type="number" 
                      step="0.01" 
                      placeholder="0.80" 
                      value={newSupPrice}
                      onChange={(e) => setNewSupPrice(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">MOQ (Units)</label>
                    <Input 
                      type="number" 
                      placeholder="1000" 
                      value={newSupMOQ}
                      onChange={(e) => setNewSupMOQ(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Delivery Lead Time</label>
                  <Input 
                    placeholder="e.g. 5 Days" 
                    value={newSupLead}
                    onChange={(e) => setNewSupLead(e.target.value)}
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 border-t border-border/40 pt-4 mt-2">
                  <Button type="button" variant="outline" onClick={() => setActiveModal(null)}>Cancel</Button>
                  <Button type="submit">Map Supplier Matrix</Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function BrandDashboardPage() {
  return (
    <React.Suspense fallback={
      <div className="flex h-[400px] items-center justify-center text-muted-foreground text-sm font-medium">
        Loading Brand Management...
      </div>
    }>
      <BrandDashboardContent />
    </React.Suspense>
  )
}
