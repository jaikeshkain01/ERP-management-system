"use client"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertCircle, Nut, Plus, Search, X, Info, Landmark, ShieldAlert, Filter,
  Boxes, Tag, Truck, BarChart3, FileText, TrendingDown,
} from "lucide-react"
import Link from "next/link"
import { StatStrip } from "@/components/stat-strip"
import {
  COMPONENTS, getBrandName, getSupplierName, componentUsage,
  cheapestOffer as mCheapest, fastestOffer as mFastest,
  isSingleSupplier, formatINR as mFormatINR, formatLeadTime,
} from "@/mockdata"

interface Specification {
  key: string
  value: string
}

interface BrandVariant {
  brand: string
  brandPartNo: string
  stock: number
}

interface SupplierOffer {
  supplier: string
  brand: string
  price: string
}

interface ProductUsage {
  product: string
  pcb: string
}

interface PurchaseInsights {
  cheapestSupplier: string
  cheapestPrice: string
  fastestSupplier: string
  fastestDelivery: string
  singleSupplierRisk: "YES" | "NO"
}

interface ComponentData {
  id: string
  genericPN: string
  name: string
  category: string
  stock: number
  minStock: number
  unit: string
  solderType: "SMD" | "DIP"
  footprint: string
  spq: number
  specs: Specification[]
  brandVariants: BrandVariant[]
  suppliers: SupplierOffer[]
  usage: ProductUsage[]
  purchaseInsights: PurchaseInsights
}

// Catalog view model derived from the centralized component store.
const COMPONENTS_DATA: ComponentData[] = COMPONENTS.map((c) => {
  const cheapest = mCheapest(c)
  const fastest = mFastest(c)
  return {
    id: c.id,
    genericPN: c.genericPN,
    name: c.name,
    category: c.category,
    stock: c.stock,
    minStock: c.minStock,
    unit: c.unit,
    solderType: c.solderType,
    footprint: c.footprint,
    spq: c.spq,
    specs: c.specs,
    brandVariants: c.brandVariants.map((v) => ({
      brand: getBrandName(v.brandId),
      brandPartNo: v.partNo,
      stock: v.stock,
    })),
    suppliers: c.offers.map((o) => ({
      supplier: getSupplierName(o.supplierId),
      brand: getBrandName(o.brandId),
      price: mFormatINR(o.price),
    })),
    usage: componentUsage(c.id).map((u) => ({ product: u.product.name, pcb: u.pcb.name })),
    purchaseInsights: {
      cheapestSupplier: cheapest ? getSupplierName(cheapest.supplierId) : "—",
      cheapestPrice: cheapest ? mFormatINR(cheapest.price) : "—",
      fastestSupplier: fastest ? getSupplierName(fastest.supplierId) : "—",
      fastestDelivery: fastest ? formatLeadTime(fastest.leadTimeDays) : "—",
      singleSupplierRisk: isSingleSupplier(c) ? "YES" : "NO",
    },
  }
})

const getStatusInfo = (comp: ComponentData) => {
  if (comp.stock <= comp.minStock * 0.5) {
    return { text: "Critical", dot: "bg-destructive", bar: "bg-destructive", colorClass: "bg-destructive/10 text-destructive border-destructive/20" }
  }
  if (comp.stock < comp.minStock) {
    return { text: "Low Stock", dot: "bg-amber-500", bar: "bg-amber-500", colorClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" }
  }
  if (comp.purchaseInsights.singleSupplierRisk === "YES") {
    return { text: "Single Supplier Risk", dot: "bg-rose-500", bar: "bg-emerald-500", colorClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" }
  }
  return { text: "Healthy", dot: "bg-emerald-500", bar: "bg-emerald-500", colorClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" }
}

// Parse "₹0.80" → 0.80 for valuation math
const parsePrice = (p: string) => parseFloat(p.replace(/[^\d.]/g, "")) || 0
const cheapestOffer = (comp: ComponentData) =>
  comp.suppliers.length
    ? comp.suppliers.reduce((a, b) => (parsePrice(b.price) < parsePrice(a.price) ? b : a))
    : null
const formatINR = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 })

function ComponentListContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const initialComponentId = searchParams.get("component") || "resistor-10k"
  const [selectedId, setSelectedId] = React.useState(initialComponentId)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false)

  // Advanced Search Config
  const [searchFields, setSearchFields] = React.useState<Record<string, boolean>>({
    genericPN: true,
    brandPartNo: true,
    name: true,
    brand: true,
    supplier: true,
    footprint: true
  })

  // Dynamic dropdown lists derived from database
  const categories = Array.from(new Set(COMPONENTS_DATA.map(c => c.category)))
  const solderTypes = Array.from(new Set(COMPONENTS_DATA.map(c => c.solderType)))
  const footprints = Array.from(new Set(COMPONENTS_DATA.map(c => c.footprint)))
  const brands = Array.from(new Set(COMPONENTS_DATA.flatMap(c => c.brandVariants.map(bv => bv.brand))))
  const suppliers = Array.from(new Set(COMPONENTS_DATA.flatMap(c => c.suppliers.map(s => s.supplier))))
  const stockStatuses = ["Healthy", "Low Stock", "Critical", "Single Supplier Risk"]

  // Filters State
  const [filterCategory, setFilterCategory] = React.useState<string>("All")
  const [filterSolderType, setFilterSolderType] = React.useState<string>("All")
  const [filterBrand, setFilterBrand] = React.useState<string>("All")
  const [filterSupplier, setFilterSupplier] = React.useState<string>("All")
  const [filterStockStatus, setFilterStockStatus] = React.useState<string>("All")
  const [filterFootprint, setFilterFootprint] = React.useState<string>("All")

  const handleResetFilters = () => {
    setFilterCategory("All")
    setFilterSolderType("All")
    setFilterBrand("All")
    setFilterSupplier("All")
    setFilterStockStatus("All")
    setFilterFootprint("All")
    setSearchQuery("")
    setSearchFields({
      genericPN: true,
      brandPartNo: true,
      name: true,
      brand: true,
      supplier: true,
      footprint: true
    })
  }

  // Keyboard accessibility
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsDrawerOpen(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  // Auto-open drawer from query params
  React.useEffect(() => {
    const compParam = searchParams.get("component")
    if (compParam && COMPONENTS_DATA.some(c => c.id === compParam)) {
      setSelectedId(compParam)
      setIsDrawerOpen(true)
    }
  }, [searchParams])

  const selectedComponent = COMPONENTS_DATA.find(c => c.id === selectedId) || COMPONENTS_DATA[0]

  const handleRowClick = (id: string) => {
    setSelectedId(id)
    setIsDrawerOpen(true)
    const params = new URLSearchParams(window.location.search)
    params.set("component", id)
    router.push(`?${params.toString()}`, { scroll: false })
  }

  // Filter Catalog Table Items
  const filteredComponents = COMPONENTS_DATA.filter((comp) => {
    // Advanced Search String Query Matching
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase()
      let matchesQuery = false

      if (searchFields.genericPN && comp.genericPN.toLowerCase().includes(q)) matchesQuery = true
      if (searchFields.name && comp.name.toLowerCase().includes(q)) matchesQuery = true
      if (searchFields.footprint && comp.footprint.toLowerCase().includes(q)) matchesQuery = true
      
      // Check brands
      if (searchFields.brand && comp.brandVariants.some(bv => bv.brand.toLowerCase().includes(q))) matchesQuery = true
      if (searchFields.brandPartNo && comp.brandVariants.some(bv => bv.brandPartNo.toLowerCase().includes(q))) matchesQuery = true
      
      // Check suppliers
      if (searchFields.supplier && comp.suppliers.some(s => s.supplier.toLowerCase().includes(q))) matchesQuery = true

      if (!matchesQuery) return false
    }

    // Category Selector
    if (filterCategory !== "All" && comp.category !== filterCategory) return false

    // Solder Type Selector
    if (filterSolderType !== "All" && comp.solderType !== filterSolderType) return false

    // Footprint Selector
    if (filterFootprint !== "All" && comp.footprint !== filterFootprint) return false

    // Brand Selector
    if (filterBrand !== "All" && !comp.brandVariants.some(bv => bv.brand === filterBrand)) return false

    // Supplier Selector
    if (filterSupplier !== "All" && !comp.suppliers.some(s => s.supplier === filterSupplier)) return false

    // Stock Status Selector
    if (filterStockStatus !== "All") {
      const info = getStatusInfo(comp)
      if (filterStockStatus === "Healthy" && info.text !== "Healthy") return false
      if (filterStockStatus === "Low Stock" && info.text !== "Low Stock") return false
      if (filterStockStatus === "Critical" && info.text !== "Critical") return false
      if (filterStockStatus === "Single Supplier Risk" && info.text !== "Single Supplier Risk") return false
    }

    return true
  })

  // Summary Metrics — derived live from the catalog
  const totalValue = COMPONENTS_DATA.reduce((sum, c) => {
    const offer = cheapestOffer(c)
    return sum + (offer ? c.stock * parsePrice(offer.price) : 0)
  }, 0)
  const lowOrCritical = COMPONENTS_DATA.filter((c) => {
    const t = getStatusInfo(c).text
    return t === "Low Stock" || t === "Critical"
  }).length
  const soleSourceCount = COMPONENTS_DATA.filter((c) => c.purchaseInsights.singleSupplierRisk === "YES").length

  const kpis = [
    { title: "Catalog Items", value: COMPONENTS_DATA.length.toLocaleString(), desc: "Active components", icon: Nut, color: "text-primary bg-primary/10 border-primary/20" },
    { title: "Inventory Value", value: formatINR(totalValue), desc: "At best unit price", icon: Landmark, color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" },
    { title: "Low / Critical", value: String(lowOrCritical), desc: "Below safety stock", icon: AlertCircle, color: "text-amber-600 bg-amber-500/10 border-amber-500/20" },
    { title: "Single-Supplier Risk", value: String(soleSourceCount), desc: "Sole-sourced parts", icon: ShieldAlert, color: "text-rose-600 bg-rose-500/10 border-rose-500/20" }
  ]

  return (
    <div className="space-y-6 pb-12">
      {/* Header Row */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-muted-foreground flex items-center gap-2 font-medium">
            <span className="hover:text-foreground transition-colors cursor-pointer">Components</span>
            <span>/</span>
            <span className="text-foreground font-semibold">Component List</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Component List
          </h1>
          <p className="text-sm text-muted-foreground">
            Master raw-parts catalog — physical stock levels, sourcing, and safety thresholds.
          </p>
        </div>

        {/* Top Control Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="outline" className="gap-2 font-semibold">
            <Filter className="h-4 w-4" />
            <span>Export CSV</span>
          </Button>
          <Button className="gap-2 font-semibold" render={<Link href="/components/add" />}>
            <Plus className="h-4 w-4" />
            <span>Add Component</span>
          </Button>
        </div>
      </div>

      {/* Top summary — instrument readout strip */}
      <StatStrip
        items={kpis.map((kpi) => ({
          label: kpi.title,
          value: kpi.value,
          desc: kpi.desc,
          icon: kpi.icon,
          tone: kpi.color.includes("emerald")
            ? "success"
            : kpi.color.includes("amber")
            ? "warning"
            : kpi.color.includes("rose")
            ? "danger"
            : "default",
        }))}
      />

      {/* Advanced Search & Filtering Box */}
      <div className="bg-card border border-border p-5 rounded-xl space-y-4 shadow-2xs">
        
        {/* Search Field */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search part name, generic P/N, brand, supplier, footprint…"
            className="pl-9 bg-background border-border h-10 text-sm rounded-lg focus-visible:ring-1 focus-visible:ring-primary"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Checkbox Chips for Search Scope */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground font-semibold">Search by:</span>
          {[
            { id: "genericPN", label: "Generic Part No" },
            { id: "brandPartNo", label: "Brand Part No" },
            { id: "name", label: "Name" },
            { id: "brand", label: "Brand" },
            { id: "supplier", label: "Supplier" },
            { id: "footprint", label: "Footprint" }
          ].map((field) => {
            const active = searchFields[field.id]
            return (
              <button
                key={field.id}
                onClick={() => setSearchFields(prev => ({ ...prev, [field.id]: !prev[field.id] }))}
                className={`px-3 py-1 text-xs rounded-full border transition-all cursor-pointer font-semibold select-none ${
                  active 
                    ? "bg-primary/10 border-primary text-primary shadow-3xs" 
                    : "bg-background border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {field.label}
              </button>
            )
          })}
        </div>

        {/* Dynamic Filters Row */}
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between pb-3">
            <div className="flex items-center gap-2">
              <Filter className="h-4.5 w-4.5 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-foreground">Filter Catalog</span>
            </div>
            {(filterCategory !== "All" || filterSolderType !== "All" || filterBrand !== "All" || filterSupplier !== "All" || filterStockStatus !== "All" || filterFootprint !== "All") && (
              <button 
                onClick={handleResetFilters}
                className="text-xs text-destructive hover:underline font-semibold cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Category */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground/80">Category</label>
              <select 
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full bg-background border border-border rounded-lg text-xs p-2 outline-none focus:ring-1 focus:ring-primary cursor-pointer text-foreground font-semibold"
              >
                <option value="All">All Categories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {/* Solder Type */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground/80">Solder Type</label>
              <select 
                value={filterSolderType}
                onChange={(e) => setFilterSolderType(e.target.value)}
                className="w-full bg-background border border-border rounded-lg text-xs p-2 outline-none focus:ring-1 focus:ring-primary cursor-pointer text-foreground font-semibold"
              >
                <option value="All">All Solder Types</option>
                {solderTypes.map(st => <option key={st} value={st}>{st}</option>)}
              </select>
            </div>
            {/* Brand */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground/80">Brand</label>
              <select 
                value={filterBrand}
                onChange={(e) => setFilterBrand(e.target.value)}
                className="w-full bg-background border border-border rounded-lg text-xs p-2 outline-none focus:ring-1 focus:ring-primary cursor-pointer text-foreground font-semibold"
              >
                <option value="All">All Brands</option>
                {brands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            {/* Supplier */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground/80">Supplier</label>
              <select 
                value={filterSupplier}
                onChange={(e) => setFilterSupplier(e.target.value)}
                className="w-full bg-background border border-border rounded-lg text-xs p-2 outline-none focus:ring-1 focus:ring-primary cursor-pointer text-foreground font-semibold"
              >
                <option value="All">All Suppliers</option>
                {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {/* Stock Status */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground/80">Stock Status</label>
              <select 
                value={filterStockStatus}
                onChange={(e) => setFilterStockStatus(e.target.value)}
                className="w-full bg-background border border-border rounded-lg text-xs p-2 outline-none focus:ring-1 focus:ring-primary cursor-pointer text-foreground font-semibold"
              >
                <option value="All">All Statuses</option>
                {stockStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {/* Footprint */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-muted-foreground/80">Footprint</label>
              <select 
                value={filterFootprint}
                onChange={(e) => setFilterFootprint(e.target.value)}
                className="w-full bg-background border border-border rounded-lg text-xs p-2 outline-none focus:ring-1 focus:ring-primary cursor-pointer text-foreground font-semibold"
              >
                <option value="All">All Footprints</option>
                {footprints.map(fp => <option key={fp} value={fp}>{fp}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Component List Table Card */}
      <Card className="w-full border border-border shadow-2xs overflow-hidden bg-card">
        <CardHeader className="border-b border-border bg-muted/10 px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold text-foreground">Catalog Items</CardTitle>
              <CardDescription className="text-xs">Select a row to open the full specification panel</CardDescription>
            </div>
            <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground font-mono">
              {filteredComponents.length} / {COMPONENTS_DATA.length}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-foreground">
              <thead className="text-[10px] uppercase bg-muted/30 text-muted-foreground border-b border-border">
                <tr>
                  <th scope="col" className="pl-6 pr-2 py-3 font-semibold w-6"></th>
                  <th scope="col" className="px-6 py-3 font-semibold">Generic Part No</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Name</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Category</th>
                  <th scope="col" className="px-6 py-3 font-semibold text-center w-20">Brands</th>
                  <th scope="col" className="px-6 py-3 font-semibold text-center w-20">Suppliers</th>
                  <th scope="col" className="px-6 py-3 font-semibold w-44">Stock Level</th>
                  <th scope="col" className="px-6 py-3 font-semibold text-right w-28">Best Price</th>
                  <th scope="col" className="px-6 py-3 font-semibold text-right w-40">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredComponents.map((comp) => {
                  const isSelected = comp.id === selectedComponent.id && isDrawerOpen
                  const info = getStatusInfo(comp)
                  const pct = Math.min(100, Math.round((comp.stock / Math.max(comp.minStock, 1)) * 100))
                  const offer = cheapestOffer(comp)
                  return (
                    <tr
                      key={comp.id}
                      onClick={() => handleRowClick(comp.id)}
                      className={`cursor-pointer transition-colors duration-150 ${
                        isSelected ? "bg-primary/5 hover:bg-primary/5" : "hover:bg-muted/30"
                      }`}
                    >
                      <td className="pl-6 pr-2 py-4">
                        <span className={`block h-2 w-2 rounded-full ${info.dot}`} title={info.text} />
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-xs text-primary">{comp.genericPN}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`h-8 w-8 shrink-0 flex items-center justify-center rounded-lg ${isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                            <Nut className="h-4 w-4" />
                          </div>
                          <span className={`font-semibold ${isSelected ? "text-primary" : "text-foreground"}`}>{comp.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{comp.category}</td>
                      <td className="px-6 py-4 text-center font-mono font-semibold text-muted-foreground/80">{comp.brandVariants.length}</td>
                      <td className="px-6 py-4 text-center font-mono font-semibold text-muted-foreground/80">{comp.suppliers.length}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-between text-[11px] mb-1.5">
                          <span className="font-mono font-bold text-foreground">{comp.stock.toLocaleString()}</span>
                          <span className="font-mono text-muted-foreground">min {comp.minStock.toLocaleString()}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${info.bar}`} style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-semibold text-foreground">{offer ? offer.price : "—"}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${info.colorClass}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${info.dot}`} />
                          {info.text}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {filteredComponents.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-14 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Search className="h-8 w-8 opacity-30" />
                        <span className="text-sm font-medium">No components match your search and filters</span>
                        <button onClick={handleResetFilters} className="text-xs text-primary hover:underline font-semibold cursor-pointer mt-1">
                          Reset all filters
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Drawer Overlay Backdrop */}
      {isDrawerOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity duration-300"
          onClick={() => setIsDrawerOpen(false)}
        />
      )}

      {/* Slide-Out Side Details Drawer Panel */}
      {isDrawerOpen && selectedComponent && (
        <div 
          className="fixed inset-y-0 right-0 z-50 w-full md:w-[40vw] bg-card border-l border-border shadow-2xl flex flex-col scale-100 animate-in slide-in-from-right duration-250"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between border-b border-border bg-muted/20 px-6 py-4 shrink-0">
            <div className="flex items-center gap-2">
              <Nut className="h-5 w-5 text-primary" />
              <h3 className="text-base font-extrabold text-foreground">Component Details</h3>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 rounded-full border-0 bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={() => setIsDrawerOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Drawer Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Component Title & Badges */}
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Component Name</span>
                  <h4 className="text-xl font-extrabold text-foreground tracking-tight">{selectedComponent.name}</h4>
                </div>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="font-bold text-xs gap-1.5 px-3 border-primary/30 text-primary hover:bg-primary/5 hover:text-primary cursor-pointer shrink-0 h-7.5"
                  render={<Link href={`/components/details?component=${selectedComponent.id}`} />}
                  onClick={() => setIsDrawerOpen(false)}
                >
                  <Info className="h-3.5 w-3.5" />
                  <span>Manage Details</span>
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-xs font-black bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded">
                  {selectedComponent.genericPN}
                </span>
                <span className="text-xs font-semibold bg-secondary text-secondary-foreground px-2 py-0.5 rounded">
                  {selectedComponent.category}
                </span>
                <span className="text-xs font-semibold bg-secondary text-secondary-foreground px-2 py-0.5 rounded">
                  {selectedComponent.solderType}
                </span>
                <span className="text-xs font-semibold bg-secondary text-secondary-foreground px-2 py-0.5 rounded font-mono">
                  {selectedComponent.footprint}
                </span>
              </div>
            </div>

            {/* Section 1: Component Information */}
            <div className="space-y-2">
              <h5 className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-primary" />
                Component Information
              </h5>
              <div className="border border-border rounded-lg overflow-hidden bg-muted/5 text-xs">
                <table className="w-full text-left">
                  <tbody className="divide-y divide-border font-medium">
                    <tr className="hover:bg-muted/10">
                      <td className="px-4 py-2 text-muted-foreground font-bold">Generic Part No</td>
                      <td className="px-4 py-2 text-right font-mono font-bold text-primary">{selectedComponent.genericPN}</td>
                    </tr>
                    <tr className="hover:bg-muted/10">
                      <td className="px-4 py-2 text-muted-foreground font-bold">Category</td>
                      <td className="px-4 py-2 text-right">{selectedComponent.category}</td>
                    </tr>
                    <tr className="hover:bg-muted/10">
                      <td className="px-4 py-2 text-muted-foreground font-bold">Solder Type</td>
                      <td className="px-4 py-2 text-right">{selectedComponent.solderType}</td>
                    </tr>
                    <tr className="hover:bg-muted/10">
                      <td className="px-4 py-2 text-muted-foreground font-bold">Footprint</td>
                      <td className="px-4 py-2 text-right font-mono">{selectedComponent.footprint}</td>
                    </tr>
                    <tr className="hover:bg-muted/10">
                      <td className="px-4 py-2 text-muted-foreground font-bold">SPQ</td>
                      <td className="px-4 py-2 text-right font-mono">{selectedComponent.spq.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 2: Stock Summary */}
            <div className="space-y-2">
              <h5 className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                <Boxes className="h-3.5 w-3.5 text-primary" />
                Stock Summary
              </h5>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-secondary/40 border border-border/60 p-3 rounded-lg text-center">
                  <span className="text-[9px] uppercase font-bold text-muted-foreground block">Current Stock</span>
                  <span className="text-base font-black text-foreground font-mono mt-1 block">
                    {selectedComponent.stock.toLocaleString()}
                  </span>
                </div>
                <div className="bg-secondary/40 border border-border/60 p-3 rounded-lg text-center">
                  <span className="text-[9px] uppercase font-bold text-muted-foreground block">Minimum Stock</span>
                  <span className="text-base font-black text-foreground font-mono mt-1 block">
                    {selectedComponent.minStock.toLocaleString()}
                  </span>
                </div>
                <div className="bg-secondary/40 border border-border/60 p-3 rounded-lg text-center">
                  <span className="text-[9px] uppercase font-bold text-muted-foreground block">Available Brands</span>
                  <span className="text-base font-black text-foreground font-mono mt-1 block">
                    {selectedComponent.brandVariants.length}
                  </span>
                </div>
              </div>
              {(() => {
                const info = getStatusInfo(selectedComponent)
                const pct = Math.min(100, Math.round((selectedComponent.stock / Math.max(selectedComponent.minStock, 1)) * 100))
                return (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
                      <span>Stock vs. minimum</span>
                      <span className="font-mono">{pct}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${info.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Section 3: Brand Variants (most important) */}
            <div className="space-y-2">
              <h5 className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-primary" />
                Brand Variants
              </h5>
              <div className="border border-border rounded-lg overflow-hidden bg-muted/5 text-xs">
                <table className="w-full text-left">
                  <thead className="bg-muted/40 text-muted-foreground text-[9px] uppercase border-b border-border">
                    <tr>
                      <th className="px-4 py-2 font-bold">Brand</th>
                      <th className="px-4 py-2 font-bold">Brand Part No</th>
                      <th className="px-4 py-2 font-bold text-right">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-medium">
                    {selectedComponent.brandVariants.map((bv, idx) => (
                      <tr key={idx} className="hover:bg-muted/10">
                        <td className="px-4 py-2 font-bold text-foreground">{bv.brand}</td>
                        <td className="px-4 py-2 font-mono text-muted-foreground">{bv.brandPartNo}</td>
                        <td className="px-4 py-2 text-right font-mono font-bold">{bv.stock.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 4: Suppliers */}
            <div className="space-y-2">
              <h5 className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5 text-primary" />
                Suppliers
              </h5>
              <div className="border border-border rounded-lg overflow-hidden bg-muted/5 text-xs">
                <table className="w-full text-left">
                  <thead className="bg-muted/40 text-muted-foreground text-[9px] uppercase border-b border-border">
                    <tr>
                      <th className="px-4 py-2 font-bold">Supplier</th>
                      <th className="px-4 py-2 font-bold">Brand</th>
                      <th className="px-4 py-2 font-bold text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-medium">
                    {selectedComponent.suppliers.map((sup, idx) => {
                      const best = cheapestOffer(selectedComponent)
                      const isBest = best?.supplier === sup.supplier && selectedComponent.suppliers.length > 1
                      return (
                        <tr key={idx} className="hover:bg-muted/10">
                          <td className="px-4 py-2 font-bold text-foreground">
                            <div className="flex items-center gap-1.5">
                              {sup.supplier}
                              {isBest && (
                                <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-bold text-[8px] bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/25">
                                  <TrendingDown className="h-2 w-2 mr-0.5" />BEST
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{sup.brand}</td>
                          <td className="px-4 py-2 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">{sup.price}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 5: Usage Analysis */}
            <div className="space-y-2">
              <h5 className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-primary" />
                Usage Analysis
              </h5>
              <div className="border border-border rounded-lg overflow-hidden bg-muted/5 text-xs">
                <table className="w-full text-left">
                  <thead className="bg-muted/40 text-muted-foreground text-[9px] uppercase border-b border-border">
                    <tr>
                      <th className="px-4 py-2 font-bold">Product</th>
                      <th className="px-4 py-2 font-bold">PCB</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-medium">
                    {selectedComponent.usage.map((us, idx) => (
                      <tr key={idx} className="hover:bg-muted/10">
                        <td className="px-4 py-2 font-bold text-foreground">{us.product}</td>
                        <td className="px-4 py-2 text-muted-foreground">{us.pcb}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 6: Specifications */}
            <div className="space-y-2">
              <h5 className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-primary" />
                Specifications
              </h5>
              <div className="border border-border rounded-lg overflow-hidden bg-muted/5 text-xs">
                <table className="w-full text-left">
                  <thead className="bg-muted/40 text-muted-foreground text-[9px] uppercase border-b border-border">
                    <tr>
                      <th className="px-4 py-2 font-bold">Specification</th>
                      <th className="px-4 py-2 font-bold">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-medium">
                    {selectedComponent.specs.map((spec, idx) => (
                      <tr key={idx} className="hover:bg-muted/10">
                        <td className="px-4 py-2 font-bold text-muted-foreground">{spec.key}</td>
                        <td className="px-4 py-2 font-bold text-foreground">{spec.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 7: Purchase Insights */}
            <div className="space-y-2 pb-6">
              <h5 className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                <TrendingDown className="h-3.5 w-3.5 text-primary" />
                Purchase Insights
              </h5>
              <div className="border border-border rounded-lg p-4 bg-muted/20 space-y-3 text-xs">
                <div className="flex justify-between items-center border-b border-border/50 pb-2">
                  <span className="text-muted-foreground font-semibold">Cheapest Supplier</span>
                  <div className="text-right">
                    <span className="font-bold text-foreground block">{selectedComponent.purchaseInsights.cheapestSupplier}</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-extrabold">{selectedComponent.purchaseInsights.cheapestPrice}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center border-b border-border/50 pb-2">
                  <span className="text-muted-foreground font-semibold">Fastest Delivery</span>
                  <div className="text-right">
                    <span className="font-bold text-foreground block">{selectedComponent.purchaseInsights.fastestSupplier}</span>
                    <span className="font-mono font-bold text-foreground">{selectedComponent.purchaseInsights.fastestDelivery}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground font-semibold">Single Supplier Risk</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-black ${
                    selectedComponent.purchaseInsights.singleSupplierRisk === "YES"
                      ? "bg-rose-500/10 text-rose-600 border border-rose-500/20"
                      : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                  }`}>
                    {selectedComponent.purchaseInsights.singleSupplierRisk}
                  </span>
                </div>
              </div>
            </div>



          </div>
        </div>
      )}
    </div>
  )
}

export default function ComponentListPage() {
  return (
    <React.Suspense fallback={
      <div className="flex h-[400px] items-center justify-center text-muted-foreground text-sm font-medium">
        Loading component inventory...
      </div>
    }>
      <ComponentListContent />
    </React.Suspense>
  )
}
