"use client"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  AlertCircle, CheckCircle2, Cpu, Filter, Nut, 
  Plus, Search, X, Info, AlertTriangle, Award, 
  Layers, Landmark, ShoppingBag, ShieldAlert, Award as BrandIcon, 
  AlertTriangle as LowStockIcon, ShieldAlert as RiskIcon
} from "lucide-react"
import Link from "next/link"

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

const COMPONENTS_DATA: ComponentData[] = [
  {
    id: "resistor-10k",
    genericPN: "RES-10K",
    name: "Resistor 10K",
    category: "Passive",
    stock: 7000,
    minStock: 5000,
    unit: "PCS",
    solderType: "SMD",
    footprint: "0603",
    spq: 5000,
    specs: [
      { key: "Tolerance", value: "±5%" },
      { key: "Power Rating", value: "0.25W" },
      { key: "Voltage", value: "50V" }
    ],
    brandVariants: [
      { brand: "Yageo", brandPartNo: "RC0603JR", stock: 3000 },
      { brand: "Vishay", brandPartNo: "CRCW0603", stock: 2500 },
      { brand: "Panasonic", brandPartNo: "ERJ3EKF", stock: 1500 }
    ],
    suppliers: [
      { supplier: "ABC Electronics", brand: "Yageo", price: "₹0.80" },
      { supplier: "Mouser", brand: "Vishay", price: "₹0.95" },
      { supplier: "DigiKey", brand: "Panasonic", price: "₹1.10" }
    ],
    usage: [
      { product: "ROIP400", pcb: "Audio PCB" },
      { product: "ROIP400", pcb: "Display PCB" },
      { product: "Voice Logger", pcb: "Audio PCB" }
    ],
    purchaseInsights: {
      cheapestSupplier: "ABC Electronics",
      cheapestPrice: "₹0.80",
      fastestSupplier: "XYZ Components",
      fastestDelivery: "2 Days",
      singleSupplierRisk: "NO"
    }
  },
  {
    id: "capacitor-100uf",
    genericPN: "CAP-100UF",
    name: "Capacitor 100uF",
    category: "Passive",
    stock: 400,
    minStock: 500,
    unit: "PCS",
    solderType: "DIP",
    footprint: "Radial 6.3x11mm",
    spq: 500,
    specs: [
      { key: "Tolerance", value: "±20%" },
      { key: "Power Rating", value: "0.5W" },
      { key: "Voltage", value: "25V" }
    ],
    brandVariants: [
      { brand: "Nichicon", brandPartNo: "UVR1E101MED", stock: 250 },
      { brand: "Rubycon", brandPartNo: "25YXG100M", stock: 150 }
    ],
    suppliers: [
      { supplier: "ABC Electronics", brand: "Nichicon", price: "₹1.50" },
      { supplier: "Mouser", brand: "Rubycon", price: "₹1.80" },
      { supplier: "DigiKey", brand: "Nichicon", price: "₹1.70" },
      { supplier: "Arrow", brand: "Rubycon", price: "₹1.90" }
    ],
    usage: [
      { product: "ROIP400", pcb: "Audio PCB" },
      { product: "Voice Logger", pcb: "Main PCB" }
    ],
    purchaseInsights: {
      cheapestSupplier: "ABC Electronics",
      cheapestPrice: "₹1.50",
      fastestSupplier: "XYZ Components",
      fastestDelivery: "1 Day",
      singleSupplierRisk: "NO"
    }
  },
  {
    id: "audio-codec",
    genericPN: "AUDIO-CODEC",
    name: "Audio Codec IC",
    category: "IC",
    stock: 50,
    minStock: 120,
    unit: "PCS",
    solderType: "SMD",
    footprint: "QFN-32",
    spq: 1000,
    specs: [
      { key: "Type", value: "Stereo Audio Codec" },
      { key: "Interface", value: "I2C, I2S" },
      { key: "Resolution", value: "24-bit" }
    ],
    brandVariants: [
      { brand: "Texas Instruments", brandPartNo: "TLV320AIC3104", stock: 50 }
    ],
    suppliers: [
      { supplier: "ABC Electronics", brand: "Texas Instruments", price: "₹68.00" }
    ],
    usage: [
      { product: "ROIP400", pcb: "Audio PCB" },
      { product: "Voice Logger", pcb: "Audio PCB" }
    ],
    purchaseInsights: {
      cheapestSupplier: "ABC Electronics",
      cheapestPrice: "₹68.00",
      fastestSupplier: "ABC Electronics",
      fastestDelivery: "3 Days",
      singleSupplierRisk: "YES"
    }
  },
  {
    id: "gsm-chip",
    genericPN: "GSM-CHIP",
    name: "GSM Chipset",
    category: "RF Module",
    stock: 350,
    minStock: 200,
    unit: "PCS",
    solderType: "SMD",
    footprint: "LGA-68",
    spq: 250,
    specs: [
      { key: "Technology", value: "Quad-band GSM/GPRS" },
      { key: "Voltage Range", value: "3.3V - 4.6V" },
      { key: "Dimension", value: "18.7 x 16.0 mm" }
    ],
    brandVariants: [
      { brand: "Quectel", brandPartNo: "MC60", stock: 350 }
    ],
    suppliers: [
      { supplier: "XYZ Components", brand: "Quectel", price: "₹380.00" }
    ],
    usage: [
      { product: "ROIP400", pcb: "GSM PCB" }
    ],
    purchaseInsights: {
      cheapestSupplier: "XYZ Components",
      cheapestPrice: "₹380.00",
      fastestSupplier: "XYZ Components",
      fastestDelivery: "2 Days",
      singleSupplierRisk: "YES"
    }
  },
  {
    id: "mcu-stm32",
    genericPN: "MCU-STM32",
    name: "STM32 Microcontroller",
    category: "IC",
    stock: 1200,
    minStock: 1000,
    unit: "PCS",
    solderType: "SMD",
    footprint: "LQFP-64",
    spq: 90,
    specs: [
      { key: "Core", value: "ARM Cortex-M4" },
      { key: "Frequency", value: "84MHz" },
      { key: "Flash Memory", value: "512KB" }
    ],
    brandVariants: [
      { brand: "STMicroelectronics", brandPartNo: "STM32F401RET6", stock: 700 },
      { brand: "GigaDevice", brandPartNo: "GD32F401RET6", stock: 500 }
    ],
    suppliers: [
      { supplier: "Mouser", brand: "STMicroelectronics", price: "₹125.00" },
      { supplier: "DigiKey", brand: "STMicroelectronics", price: "₹128.00" },
      { supplier: "XYZ Components", brand: "GigaDevice", price: "₹110.00" }
    ],
    usage: [
      { product: "Voice Logger", pcb: "Main PCB" }
    ],
    purchaseInsights: {
      cheapestSupplier: "XYZ Components",
      cheapestPrice: "₹110.00",
      fastestSupplier: "DigiKey",
      fastestDelivery: "2 Days",
      singleSupplierRisk: "NO"
    }
  },
  {
    id: "led-green",
    genericPN: "LED-GRN",
    name: "LED Green Indicator",
    category: "Optoelectronics",
    stock: 300,
    minStock: 1000,
    unit: "PCS",
    solderType: "DIP",
    footprint: "5mm Radial",
    spq: 1000,
    specs: [
      { key: "Color", value: "Green" },
      { key: "Forward Voltage", value: "2.1V" },
      { key: "Luminous Intensity", value: "120mcd" }
    ],
    brandVariants: [
      { brand: "Everlight", brandPartNo: "EL-513-GRN", stock: 150 },
      { brand: "Lite-On", brandPartNo: "LTL-4231N", stock: 150 }
    ],
    suppliers: [
      { supplier: "LED Depot", brand: "Everlight", price: "₹2.20" },
      { supplier: "XYZ Components", brand: "Lite-On", price: "₹2.10" },
      { supplier: "ABC Electronics", brand: "Everlight", price: "₹2.40" }
    ],
    usage: [
      { product: "ROIP400", pcb: "Display PCB" },
      { product: "Voice Logger", pcb: "Interface PCB" }
    ],
    purchaseInsights: {
      cheapestSupplier: "XYZ Components",
      cheapestPrice: "₹2.10",
      fastestSupplier: "XYZ Components",
      fastestDelivery: "1 Day",
      singleSupplierRisk: "NO"
    }
  }
]

const getStatusInfo = (comp: ComponentData) => {
  if (comp.stock <= comp.minStock * 0.5) {
    return { text: "Critical", icon: "🔴", colorClass: "bg-destructive/10 text-destructive border-destructive/20" }
  }
  if (comp.stock < comp.minStock) {
    return { text: "Low Stock", icon: "🟡", colorClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" }
  }
  if (comp.purchaseInsights.singleSupplierRisk === "YES") {
    return { text: "Single Supplier Risk", icon: "⚠️", colorClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" }
  }
  return { text: "Healthy", icon: "🟢", colorClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" }
}

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

  // Summary Metrics Setup
  const kpis = [
    { title: "Total Components", value: "1,250 Components", icon: Nut, color: "text-blue-600 bg-blue-500/10 border-blue-500/20" },
    { title: "Total Brands", value: "420 Brands", icon: Award, color: "text-purple-600 bg-purple-500/10 border-purple-500/20" },
    { title: "Low Stock Components", value: "28 Low Stock", icon: AlertCircle, color: "text-amber-600 bg-amber-500/10 border-amber-500/20" },
    { title: "Single Supplier Risk", value: "14 Risk Items", icon: ShieldAlert, color: "text-rose-600 bg-rose-500/10 border-rose-500/20" }
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
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Component List
          </h1>
          <p className="text-sm text-muted-foreground leading-none">
            Track master raw parts catalog, physical stock levels, and safety thresholds.
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

      {/* Top 4 Summary Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, index) => {
          const Icon = kpi.icon
          return (
            <Card key={index} className="transition-all hover:shadow-md hover:-translate-y-0.5 border border-border bg-card relative overflow-hidden group">
              <div className="absolute top-0 right-0 h-12 w-12 -mr-2 -mt-2 rounded-full bg-primary/5 transition-all group-hover:scale-110" />
              <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
                <CardTitle className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">{kpi.title}</CardTitle>
                <div className={`h-8 w-8 flex items-center justify-center rounded-lg border ${kpi.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-xl font-black text-foreground tracking-tight">{kpi.value}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Advanced Search & Filtering Box */}
      <div className="bg-card border border-border p-5 rounded-xl space-y-4 shadow-2xs">
        
        {/* Search Field */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
          <Input 
            placeholder="🔍 Search Anything..." 
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
          <CardTitle className="text-base font-extrabold text-foreground">Catalog Items</CardTitle>
          <CardDescription className="text-xs">Click on any row to open the Right Drawer Spec Sheet</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-foreground">
              <thead className="text-[10px] uppercase bg-muted/30 text-muted-foreground border-b border-border">
                <tr>
                  <th scope="col" className="px-4 py-3 text-center font-bold w-12">Indicator</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Generic Part No</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Name</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Category</th>
                  <th scope="col" className="px-6 py-3 font-semibold text-center w-24">Brands</th>
                  <th scope="col" className="px-6 py-3 font-semibold text-center w-24">Suppliers</th>
                  <th scope="col" className="px-6 py-3 font-semibold text-right w-32">Stock</th>
                  <th scope="col" className="px-6 py-3 font-semibold text-right w-24">SPQ</th>
                  <th scope="col" className="px-6 py-3 font-semibold text-right w-44">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredComponents.map((comp) => {
                  const isSelected = comp.id === selectedComponent.id && isDrawerOpen
                  const info = getStatusInfo(comp)
                  return (
                    <tr 
                      key={comp.id} 
                      onClick={() => handleRowClick(comp.id)}
                      className={`hover:bg-muted/30 cursor-pointer transition-all duration-150 ${
                        isSelected ? "bg-primary/5 hover:bg-primary/5 font-semibold text-primary" : ""
                      }`}
                    >
                      <td className="px-4 py-4 text-center text-lg">{info.icon}</td>
                      <td className="px-6 py-4 font-mono font-bold text-xs text-primary">{comp.genericPN}</td>
                      <td className="px-6 py-4 font-semibold text-foreground">
                        <div className="flex items-center gap-2">
                          <Nut className={`h-4 w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                          <span>{comp.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{comp.category}</td>
                      <td className="px-6 py-4 text-center font-semibold text-muted-foreground/80">{comp.brandVariants.length}</td>
                      <td className="px-6 py-4 text-center font-semibold text-muted-foreground/80">{comp.suppliers.length}</td>
                      <td className="px-6 py-4 font-mono font-bold text-right text-foreground">{comp.stock.toLocaleString()}</td>
                      <td className="px-6 py-4 font-mono text-right text-muted-foreground">{comp.spq.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold border ${info.colorClass}`}>
                          {info.text}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {filteredComponents.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-10 text-center text-muted-foreground font-semibold">
                      No components match your search and filter criteria.
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
              <h5 className="text-[10px] uppercase font-extrabold text-muted-foreground tracking-wider flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Section 1: Component Information
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
              <h5 className="text-[10px] uppercase font-extrabold text-muted-foreground tracking-wider flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Section 2: Stock Summary
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
            </div>

            {/* Section 3: Brand Variants (most important) */}
            <div className="space-y-2">
              <h5 className="text-[10px] uppercase font-extrabold text-muted-foreground tracking-wider flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Section 3: Brand Variants
                </div>
                <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-black">MOST IMPORTANT</span>
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
              <h5 className="text-[10px] uppercase font-extrabold text-muted-foreground tracking-wider flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Section 4: Suppliers
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
                    {selectedComponent.suppliers.map((sup, idx) => (
                      <tr key={idx} className="hover:bg-muted/10">
                        <td className="px-4 py-2 font-bold text-foreground">{sup.supplier}</td>
                        <td className="px-4 py-2 text-muted-foreground">{sup.brand}</td>
                        <td className="px-4 py-2 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">{sup.price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 5: Usage Analysis */}
            <div className="space-y-2">
              <h5 className="text-[10px] uppercase font-extrabold text-muted-foreground tracking-wider flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Section 5: Usage Analysis
                </div>
                <span className="text-[9px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded font-black">VERY IMPORTANT</span>
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
              <h5 className="text-[10px] uppercase font-extrabold text-muted-foreground tracking-wider flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Section 6: Specifications
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
              <h5 className="text-[10px] uppercase font-extrabold text-muted-foreground tracking-wider flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                Section 7: Purchase Insights
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
