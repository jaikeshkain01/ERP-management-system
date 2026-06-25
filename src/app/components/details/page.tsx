"use client"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ArrowLeft, Plus, Edit2, Star, Landmark,
  ShieldCheck, AlertCircle, X, Check, Cpu, Package,
  Info, Wrench, BarChart2, Inbox, Trash2,
  Boxes, Truck, Layers, Gauge, Zap, ShieldAlert, Clock, TrendingDown,
} from "lucide-react"
import Link from "next/link"

interface SupplierOffer {
  manufacturer: string
  name: string
  price: string
  moq: number
  leadTime: string
  preferred?: boolean
}

interface MfgVariant {
  manufacturer: string
  mfgPartNo: string
  stock: number
}

interface UsageItem {
  product: string
  pcb: string
  qty: number
}

interface WhereUsedProductNode {
  product: string
  pcbs: string[]
}

interface ComponentDetailData {
  name: string
  category: string
  genericPN: string
  solderType: "SMD" | "DIP"
  footprint: string
  spq: number
  minStock: number
  unit: string
  status: "Healthy" | "Low"
  description: string
  mfgVariants: MfgVariant[]
  suppliers: SupplierOffer[]
  usedInProductsCount: number
  usedInPCBsCount: number
  totalUsageProduct: string
  totalUsageQty: number
  productUsageTable: UsageItem[]
  whereUsedTree: WhereUsedProductNode[]
  usedInList: string[]
  specs: { key: string; value: string }[]
}

const COMPONENTS_DATA: Record<string, ComponentDetailData> = {
  "resistor-10k": {
    name: "Resistor 10K",
    category: "Passive",
    genericPN: "RES-10K",
    solderType: "SMD",
    footprint: "0603",
    spq: 5000,
    minStock: 5000,
    unit: "PCS",
    status: "Healthy",
    description: "10k Ohm metal film chip resistor, 0.25W power rating, ±1% tolerance.",
    usedInList: ["ROIP400", "Voice Logger"],
    mfgVariants: [
      { manufacturer: "Yageo", mfgPartNo: "RC0603JR-0710KL", stock: 5000 },
      { manufacturer: "Vishay", mfgPartNo: "CRCW060310K0FKEA", stock: 2000 },
    ],
    suppliers: [
      { manufacturer: "Yageo", name: "ABC Electronics", price: "₹0.80", moq: 1000, leadTime: "3 Days", preferred: true },
      { manufacturer: "Vishay", name: "Mouser", price: "₹0.95", moq: 500, leadTime: "7 Days" },
    ],
    usedInProductsCount: 3,
    usedInPCBsCount: 8,
    totalUsageProduct: "ROIP 400",
    totalUsageQty: 25,
    productUsageTable: [
      { product: "ROIP 400", pcb: "Audio PCB", qty: 20 },
      { product: "ROIP 400", pcb: "Display PCB", qty: 5 },
      { product: "Voice Logger", pcb: "Audio PCB", qty: 10 },
      { product: "Dispatcher", pcb: "Power PCB", qty: 8 },
    ],
    whereUsedTree: [
      { product: "ROIP 400", pcbs: ["Audio PCB", "Display PCB"] },
      { product: "Voice Logger", pcbs: ["Audio PCB"] },
      { product: "Dispatcher", pcbs: ["Power PCB"] },
    ],
    specs: [
      { key: "Tolerance", value: "±1%" },
      { key: "Power Rating", value: "0.25W" },
      { key: "Voltage", value: "50V" }
    ]
  },
  "led-green": {
    name: "LED Green",
    category: "Optoelectronics",
    genericPN: "LED-GRN",
    solderType: "DIP",
    footprint: "5mm",
    spq: 500,
    minStock: 1000,
    unit: "PCS",
    status: "Low",
    description: "5mm green LED light emitting diode, through-hole, 2.1V forward voltage.",
    usedInList: ["ROIP400", "Voice Logger"],
    mfgVariants: [
      { manufacturer: "Everlight", mfgPartNo: "EL-513-GRN", stock: 300 },
      { manufacturer: "Lite-On", mfgPartNo: "LTL-4231N", stock: 200 },
    ],
    suppliers: [
      { manufacturer: "Everlight", name: "LED Depot", price: "₹2.20", moq: 500, leadTime: "2 Days", preferred: true },
      { manufacturer: "Lite-On", name: "XYZ Components", price: "₹2.10", moq: 2000, leadTime: "4 Days" },
      { manufacturer: "Everlight", name: "ABC Electronics", price: "₹2.40", moq: 100, leadTime: "1 Day" },
    ],
    usedInProductsCount: 2,
    usedInPCBsCount: 4,
    totalUsageProduct: "ROIP 400",
    totalUsageQty: 12,
    productUsageTable: [
      { product: "ROIP 400", pcb: "Display PCB", qty: 10 },
      { product: "ROIP 400", pcb: "Audio PCB", qty: 2 },
      { product: "Voice Logger", pcb: "Interface PCB", qty: 5 },
    ],
    whereUsedTree: [
      { product: "ROIP 400", pcbs: ["Display PCB", "Audio PCB"] },
      { product: "Voice Logger", pcbs: ["Interface PCB"] },
    ],
    specs: [
      { key: "Color", value: "Green" },
      { key: "Forward Voltage", value: "2.1V" },
      { key: "Luminous Intensity", value: "120mcd" }
    ]
  },
  "capacitor-100uf": {
    name: "Capacitor 100uF",
    category: "Passive",
    genericPN: "CAP-100UF",
    solderType: "DIP",
    footprint: "Radial 6.3x11mm",
    spq: 2000,
    minStock: 1000,
    unit: "PCS",
    status: "Healthy",
    description: "100uF aluminum electrolytic capacitor, 25V, radial lead, 20% tolerance.",
    usedInList: ["ROIP400", "Voice Logger"],
    mfgVariants: [
      { manufacturer: "Nichicon", mfgPartNo: "UVR1E101MED", stock: 4000 },
      { manufacturer: "Rubycon", mfgPartNo: "25YXG100MEFC6.3X11", stock: 4000 },
    ],
    suppliers: [
      { manufacturer: "Nichicon", name: "PowerTech", price: "₹1.50", moq: 500, leadTime: "2 Days", preferred: true },
      { manufacturer: "Rubycon", name: "XYZ Components", price: "₹1.40", moq: 2500, leadTime: "5 Days" },
      { manufacturer: "Nichicon", name: "ABC Electronics", price: "₹1.65", moq: 1000, leadTime: "3 Days" },
    ],
    usedInProductsCount: 2,
    usedInPCBsCount: 5,
    totalUsageProduct: "ROIP 400",
    totalUsageQty: 15,
    productUsageTable: [
      { product: "ROIP 400", pcb: "Audio PCB", qty: 15 },
      { product: "Voice Logger", pcb: "Memory PCB", qty: 8 },
    ],
    whereUsedTree: [
      { product: "ROIP 400", pcbs: ["Audio PCB"] },
      { product: "Voice Logger", pcbs: ["Memory PCB"] },
    ],
    specs: [
      { key: "Capacitance", value: "100uF" },
      { key: "Voltage Rating", value: "25V" },
      { key: "Tolerance", value: "±20%" }
    ]
  },
}

function ComponentDetailsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const componentId = searchParams.get("component") || "resistor-10k"

  // Component details State
  const [componentsData, setComponentsData] = React.useState<Record<string, ComponentDetailData>>(COMPONENTS_DATA)
  const [activeModal, setActiveModal] = React.useState<'add-supplier' | 'edit-price' | 'set-preferred' | 'add-variant' | 'edit-component' | 'delete-component' | null>(null)
  
  // Toast notifications State
  const [toast, setToast] = React.useState<{ message: string; type: "success" | "error" } | null>(null)

  // Add Supplier Form State
  const [newSupplierMfg, setNewSupplierMfg] = React.useState("")
  const [newSupplierName, setNewSupplierName] = React.useState("")
  const [newSupplierPrice, setNewSupplierPrice] = React.useState("")
  const [newSupplierMOQ, setNewSupplierMOQ] = React.useState("")
  const [newSupplierLeadTime, setNewSupplierLeadTime] = React.useState("")
  const [newSupplierPreferred, setNewSupplierPreferred] = React.useState(false)

  // Edit Price Form State
  const [editSupplierName, setEditSupplierName] = React.useState("")
  const [editSupplierPrice, setEditSupplierPrice] = React.useState("")

  // Set Preferred Form State
  const [preferredSupplierName, setPreferredSupplierName] = React.useState("")

  // Add Variant Form State
  const [newVariantMfg, setNewVariantMfg] = React.useState("")
  const [newVariantPartNo, setNewVariantPartNo] = React.useState("")
  const [newVariantStock, setNewVariantStock] = React.useState("")

  // Edit Component Form State
  const [editCompName, setEditCompName] = React.useState("")
  const [editCompCategory, setEditCompCategory] = React.useState("")
  const [editCompGenericPN, setEditCompGenericPN] = React.useState("")
  const [editCompSolderType, setEditCompSolderType] = React.useState<"SMD" | "DIP">("SMD")
  const [editCompFootprint, setEditCompFootprint] = React.useState("")
  const [editCompSPQ, setEditCompSPQ] = React.useState("")

  // Load state from localStorage on mount
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mockup2_erp_components_details")
      if (saved) {
        try {
          setComponentsData(JSON.parse(saved))
        } catch (e) {
          console.error("Failed to parse component details state", e)
        }
      }
    }
  }, [])

  const saveToLocalStorage = (newData: Record<string, ComponentDetailData>) => {
    setComponentsData(newData)
    if (typeof window !== "undefined") {
      localStorage.setItem("mockup2_erp_components_details", JSON.stringify(newData))
    }
  }

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const component = componentsData[componentId] || COMPONENTS_DATA["resistor-10k"]

  // Calculate dynamic stock sum from variants
  const calculatedTotalStock = component.mfgVariants.reduce((sum, v) => sum + (v.stock || 0), 0)

  // --- Derived procurement / stock insights ---
  const parsePrice = (p: string) => parseFloat(p.replace(/[^\d.]/g, "")) || 0
  const parseLeadDays = (l: string) => parseInt(l.replace(/[^\d]/g, ""), 10) || 0
  const formatINR = (n: number) =>
    "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 })

  const stockPct = Math.min(100, Math.round((calculatedTotalStock / Math.max(component.minStock, 1)) * 100))
  const isHealthy = calculatedTotalStock >= component.minStock
  const maxVariantStock = component.mfgVariants.reduce((m, v) => Math.max(m, v.stock || 0), 0)

  const cheapestSupplier = component.suppliers.length
    ? component.suppliers.reduce((a, b) => (parsePrice(b.price) < parsePrice(a.price) ? b : a))
    : null
  const fastestSupplier = component.suppliers.length
    ? component.suppliers.reduce((a, b) => (parseLeadDays(b.leadTime) < parseLeadDays(a.leadTime) ? b : a))
    : null
  const singleSupplierRisk = component.suppliers.length <= 1
  const stockValue = cheapestSupplier ? calculatedTotalStock * parsePrice(cheapestSupplier.price) : 0

  // Prepopulate edit modal state
  const openEditModal = () => {
    setEditCompName(component.name)
    setEditCompCategory(component.category)
    setEditCompGenericPN(component.genericPN)
    setEditCompSolderType(component.solderType)
    setEditCompFootprint(component.footprint)
    setEditCompSPQ(component.spq.toString())
    setActiveModal("edit-component")
  }

  // Edit component handler
  const handleUpdateComponent = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editCompName.trim() || !editCompGenericPN.trim()) {
      showToast("Name and Generic Part Number are required", "error")
      return
    }

    const spqNum = parseInt(editCompSPQ) || 0

    const updatedComponent: ComponentDetailData = {
      ...component,
      name: editCompName.trim(),
      category: editCompCategory,
      genericPN: editCompGenericPN.trim(),
      solderType: editCompSolderType,
      footprint: editCompFootprint.trim(),
      spq: spqNum
    }

    const updatedData = {
      ...componentsData,
      [componentId]: updatedComponent
    }

    saveToLocalStorage(updatedData)
    setActiveModal(null)
    showToast(`Successfully updated component ${updatedComponent.name}!`)
  }

  // Delete component handler
  const handleDeleteComponent = () => {
    const updatedData = { ...componentsData }
    delete updatedData[componentId]

    // Save to state and localStorage
    setComponentsData(updatedData)
    if (typeof window !== "undefined") {
      localStorage.setItem("mockup2_erp_components_details", JSON.stringify(updatedData))
    }

    setActiveModal(null)
    showToast(`Successfully deleted component ${component.name}!`)
    setTimeout(() => {
      router.push("/components/list")
    }, 1000)
  }

  const handleAddSupplier = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSupplierName.trim() || !newSupplierPrice || !newSupplierMOQ || !newSupplierLeadTime || !newSupplierMfg.trim()) {
      showToast("Please fill in all fields", "error")
      return
    }

    const priceNum = parseFloat(newSupplierPrice)
    if (isNaN(priceNum) || priceNum <= 0) {
      showToast("Price must be a valid positive number", "error")
      return
    }

    const moqNum = parseInt(newSupplierMOQ)
    if (isNaN(moqNum) || moqNum <= 0) {
      showToast("MOQ must be a valid positive number", "error")
      return
    }

    const formattedPrice = `₹${priceNum.toFixed(2)}`
    const formattedLeadTime = newSupplierLeadTime.toLowerCase().includes("day") 
      ? newSupplierLeadTime 
      : `${newSupplierLeadTime} Days`

    const newSupplier: SupplierOffer = {
      manufacturer: newSupplierMfg.trim(),
      name: newSupplierName.trim(),
      price: formattedPrice,
      moq: moqNum,
      leadTime: formattedLeadTime,
      preferred: newSupplierPreferred
    }

    let updatedSuppliers = [...component.suppliers]
    if (newSupplierPreferred) {
      // Unset preferred for other suppliers
      updatedSuppliers = updatedSuppliers.map(s => ({ ...s, preferred: false }))
    }
    updatedSuppliers.push(newSupplier)

    const updatedComponent = {
      ...component,
      suppliers: updatedSuppliers
    }

    const updatedData = {
      ...componentsData,
      [componentId]: updatedComponent
    }

    saveToLocalStorage(updatedData)
    
    // Reset form
    setNewSupplierMfg("")
    setNewSupplierName("")
    setNewSupplierPrice("")
    setNewSupplierMOQ("")
    setNewSupplierLeadTime("")
    setNewSupplierPreferred(false)
    setActiveModal(null)
    showToast(`Successfully added ${newSupplier.name}!`)
  }

  const handleEditPrice = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editSupplierName || !editSupplierPrice) {
      showToast("Please select a supplier and enter a price", "error")
      return
    }

    const priceNum = parseFloat(editSupplierPrice)
    if (isNaN(priceNum) || priceNum <= 0) {
      showToast("Price must be a valid positive number", "error")
      return
    }

    const formattedPrice = `₹${priceNum.toFixed(2)}`

    const updatedSuppliers = component.suppliers.map(s => {
      if (s.name === editSupplierName) {
        return { ...s, price: formattedPrice }
      }
      return s
    })

    const updatedComponent = {
      ...component,
      suppliers: updatedSuppliers
    }

    const updatedData = {
      ...componentsData,
      [componentId]: updatedComponent
    }

    saveToLocalStorage(updatedData)
    
    setEditSupplierPrice("")
    setActiveModal(null)
    showToast(`Updated price for ${editSupplierName} to ${formattedPrice}`)
  }

  const handleSetPreferred = (e: React.FormEvent) => {
    e.preventDefault()
    if (!preferredSupplierName) {
      showToast("Please select a supplier", "error")
      return
    }

    const updatedSuppliers = component.suppliers.map(s => ({
      ...s,
      preferred: s.name === preferredSupplierName
    }))

    const updatedComponent = {
      ...component,
      suppliers: updatedSuppliers
    }

    const updatedData = {
      ...componentsData,
      [componentId]: updatedComponent
    }

    saveToLocalStorage(updatedData)
    
    setActiveModal(null)
    showToast(`${preferredSupplierName} is now the preferred supplier.`)
  }

  const handleAddVariant = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newVariantMfg.trim() || !newVariantPartNo.trim()) {
      showToast("Please fill in all fields", "error")
      return
    }

    if (component.mfgVariants.some(v => v.manufacturer.toLowerCase() === newVariantMfg.trim().toLowerCase() && v.mfgPartNo.toLowerCase() === newVariantPartNo.trim().toLowerCase())) {
      showToast("This variant already exists", "error")
      return
    }

    const stockNum = parseInt(newVariantStock) || 0

    const newVariant: MfgVariant = {
      manufacturer: newVariantMfg.trim(),
      mfgPartNo: newVariantPartNo.trim(),
      stock: stockNum
    }

    const updatedComponent = {
      ...component,
      mfgVariants: [...component.mfgVariants, newVariant]
    }

    const updatedData = {
      ...componentsData,
      [componentId]: updatedComponent
    }

    saveToLocalStorage(updatedData)
    setNewVariantMfg("")
    setNewVariantPartNo("")
    setNewVariantStock("")
    setActiveModal(null)
    showToast(`Successfully added variant ${newVariant.manufacturer} ${newVariant.mfgPartNo}!`)
  }

  const handleEditSupplierChange = (supName: string) => {
    setEditSupplierName(supName)
    const supplier = component.suppliers.find(s => s.name === supName)
    if (supplier) {
      const rawPrice = supplier.price.replace(/[^\d.]/g, "")
      setEditSupplierPrice(rawPrice)
    }
  }

  return (
    <div className="space-y-8">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg transition-all animate-in fade-in slide-in-from-bottom-5 duration-300 bg-background ${
          toast.type === "success" 
            ? "border-emerald-500/35 text-emerald-600 dark:text-emerald-400" 
            : "border-destructive/35 text-destructive"
        }`}>
          {toast.type === "success" ? <Check className="h-4 w-4 text-emerald-500" /> : <AlertCircle className="h-4 w-4 text-destructive" />}
          <span className="text-sm font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/80 pb-5">
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-muted-foreground flex items-center gap-2 font-medium">
            <span>Components</span>
            <span>/</span>
            <Link href="/components/list" className="hover:text-foreground transition-colors font-medium">Component List</Link>
            <span>/</span>
            <span className="text-foreground font-bold">{component.name}</span>
          </div>
          <h1 className="text-3.5xl font-black tracking-tight text-foreground">{component.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className="font-mono text-sm font-black bg-primary/10 border border-primary/25 text-primary px-2.5 py-0.5 rounded-lg select-all">
              {component.genericPN}
            </span>
            <span className="inline-flex items-center rounded-lg border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              {component.category}
            </span>
            <span className="inline-flex items-center rounded-lg border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-semibold font-mono text-muted-foreground">
              {component.solderType}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-0.5 text-xs font-bold ${
              isHealthy
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                : "bg-destructive/10 border-destructive/20 text-destructive"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isHealthy ? "bg-emerald-500" : "bg-destructive"}`} />
              {isHealthy ? "In Stock" : "Below Minimum"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-2 max-w-xl leading-relaxed">{component.description}</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button 
            variant="outline" 
            onClick={openEditModal}
            className="gap-1.5 border-border bg-background font-bold shadow-xs rounded-lg text-xs"
          >
            <Edit2 className="h-3.5 w-3.5" />
            <span>Edit</span>
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setActiveModal("delete-component")}
            className="gap-1.5 border-destructive/20 hover:bg-destructive/10 text-destructive bg-background font-bold shadow-xs rounded-lg text-xs hover:border-destructive"
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
            <span>Delete</span>
          </Button>
          <div className="h-4 w-[1px] bg-border mx-1" />
          <Button 
            variant="outline" 
            render={<Link href="/components/list" />}
            className="gap-2 border-border bg-background font-bold shadow-xs rounded-lg text-xs"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to List</span>
          </Button>
        </div>
      </div>

      {/* Key Metrics Strip */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Total Stock", value: calculatedTotalStock.toLocaleString(), sub: component.unit, icon: Boxes, accent: "text-primary bg-primary/10" },
          { label: "Stock Health", value: `${stockPct}%`, sub: isHealthy ? "Healthy" : "Below min", icon: Gauge, accent: isHealthy ? "text-emerald-600 bg-emerald-500/10" : "text-destructive bg-destructive/10" },
          { label: "Variants", value: String(component.mfgVariants.length), sub: "Approved brands", icon: Wrench, accent: "text-primary bg-primary/10" },
          { label: "Suppliers", value: String(component.suppliers.length), sub: singleSupplierRisk ? "Sole source" : "Multi-source", icon: Truck, accent: singleSupplierRisk ? "text-amber-500 bg-amber-500/10" : "text-primary bg-primary/10" },
          { label: "Best Price", value: cheapestSupplier ? cheapestSupplier.price : "—", sub: cheapestSupplier ? cheapestSupplier.name : "No offers", icon: TrendingDown, accent: "text-emerald-600 bg-emerald-500/10" },
          { label: "Used In", value: String(component.usedInProductsCount), sub: `${component.usedInPCBsCount} PCBs`, icon: Layers, accent: "text-primary bg-primary/10" },
        ].map((m) => {
          const Icon = m.icon
          return (
            <Card key={m.label} className="border border-border shadow-xs">
              <CardContent className="p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{m.label}</span>
                  <div className={`h-7 w-7 flex items-center justify-center rounded-lg ${m.accent}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                </div>
                <div className="text-xl font-black tracking-tight mt-1.5 truncate">{m.value}</div>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">{m.sub}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Primary Details Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Side: Info & Lists */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Specifications (Consolidated Field | Value Layout) */}
          <Card className="border border-border shadow-sm overflow-hidden">
            <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
              <div className="flex items-center gap-2">
                <Info className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg font-bold">Specifications</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
                {([
                  { key: "Category", value: component.category },
                  { key: "Solder Type", value: component.solderType, mono: true },
                  { key: "Footprint", value: component.footprint, mono: true, accent: true },
                  { key: "SPQ", value: component.spq.toLocaleString(), mono: true },
                  { key: "Min Stock", value: component.minStock.toLocaleString(), mono: true },
                  { key: "Unit", value: component.unit },
                  ...(component.specs || []),
                ] as { key: string; value: string; mono?: boolean; accent?: boolean }[]).map((spec) => (
                  <div key={spec.key} className="bg-background p-4">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{spec.key}</dt>
                    <dd className={`mt-1 text-sm font-bold ${spec.mono ? "font-mono" : ""} ${spec.accent ? "text-primary" : "text-foreground"}`}>
                      {spec.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          {/* Card 2: Brand Variants */}
          <Card className="border border-border shadow-sm overflow-hidden">
            <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg font-bold">Brand Variants</CardTitle>
                </div>
                <Button 
                  size="sm"
                  className="font-bold gap-1 cursor-pointer text-xs"
                  onClick={() => {
                    setNewVariantMfg("")
                    setNewVariantPartNo("")
                    setNewVariantStock("")
                    setActiveModal("add-variant")
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Variant</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm text-left text-foreground">
                <thead className="bg-muted/40 text-muted-foreground border-b border-border font-bold uppercase text-[10px]">
                  <tr>
                    <th scope="col" className="px-6 py-3">Brand</th>
                    <th scope="col" className="px-6 py-3">Brand Part No</th>
                    <th scope="col" className="px-6 py-3 text-right">Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {component.mfgVariants && component.mfgVariants.map((variant, idx) => (
                    <tr key={idx} className="hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-3.5 font-bold text-sm">{variant.manufacturer}</td>
                      <td className="px-6 py-3.5 font-mono text-xs font-semibold text-primary">{variant.mfgPartNo}</td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center justify-end gap-2.5">
                          <div className="hidden sm:block h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary/70"
                              style={{ width: `${maxVariantStock ? Math.round(((variant.stock || 0) / maxVariantStock) * 100) : 0}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs font-bold w-16 text-right">{(variant.stock || 0).toLocaleString()}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!component.mfgVariants || component.mfgVariants.length === 0) && (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">
                        <Inbox className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2" />
                        No brand variants registered.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Card 3: Suppliers */}
          <Card className="border border-border shadow-sm overflow-hidden">
            <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg font-bold">Suppliers</CardTitle>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <Button 
                    size="sm"
                    className="font-bold gap-1.5 cursor-pointer text-xs"
                    onClick={() => {
                      setNewSupplierMfg("")
                      setNewSupplierName("")
                      setNewSupplierPrice("")
                      setNewSupplierMOQ("")
                      setNewSupplierLeadTime("")
                      setNewSupplierPreferred(false)
                      setActiveModal('add-supplier')
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Supplier</span>
                  </Button>
                  <Button 
                    size="sm"
                    className="font-bold gap-1.5 cursor-pointer text-xs" 
                    variant="outline"
                    onClick={() => {
                      if (component.suppliers.length > 0) {
                        setEditSupplierName(component.suppliers[0].name)
                        const rawPrice = component.suppliers[0].price.replace(/[^\d.]/g, "")
                        setEditSupplierPrice(rawPrice)
                      } else {
                        setEditSupplierName("")
                        setEditSupplierPrice("")
                      }
                      setActiveModal('edit-price')
                    }}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    <span>Edit Price</span>
                  </Button>
                  <Button 
                    size="sm"
                    className="font-bold gap-1.5 cursor-pointer text-xs" 
                    variant="outline"
                    onClick={() => {
                      const currentPreferred = component.suppliers.find(s => s.preferred)
                      if (currentPreferred) {
                        setPreferredSupplierName(currentPreferred.name)
                      } else if (component.suppliers.length > 0) {
                        setPreferredSupplierName(component.suppliers[0].name)
                      } else {
                        setPreferredSupplierName("")
                      }
                      setActiveModal('set-preferred')
                    }}
                  >
                    <Star className="h-3.5 w-3.5" />
                    <span>Set Preferred</span>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-foreground">
                  <thead className="text-[11px] uppercase bg-muted/40 text-muted-foreground border-b border-border font-bold tracking-wide">
                    <tr>
                      <th scope="col" className="px-6 py-3">Supplier</th>
                      <th scope="col" className="px-6 py-3">Brand</th>
                      <th scope="col" className="px-6 py-3 text-right">MOQ</th>
                      <th scope="col" className="px-6 py-3 text-right">Lead Time</th>
                      <th scope="col" className="px-6 py-3 text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-background">
                    {component.suppliers.map((sup, idx) => {
                      const isCheapest = cheapestSupplier?.name === sup.name && component.suppliers.length > 1
                      return (
                        <tr key={idx} className="hover:bg-muted/10 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 font-semibold">
                              <span>{sup.name}</span>
                              {sup.preferred && (
                                <span className="inline-flex items-center text-amber-500 font-bold text-[9px] bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/25">
                                  <Star className="h-2.5 w-2.5 fill-amber-500 mr-0.5" />
                                  Preferred
                                </span>
                              )}
                              {isCheapest && (
                                <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-bold text-[9px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/25">
                                  <TrendingDown className="h-2.5 w-2.5 mr-0.5" />
                                  Best
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-muted-foreground font-semibold">{sup.manufacturer || "-"}</td>
                          <td className="px-6 py-4 font-mono text-xs text-right text-muted-foreground">{sup.moq.toLocaleString()}</td>
                          <td className="px-6 py-4 text-right">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {sup.leadTime}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-mono text-primary font-bold text-sm text-right">{sup.price}</td>
                        </tr>
                      )
                    })}
                    {component.suppliers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                          No suppliers registered in active matrix.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Procurement insights footer */}
              {component.suppliers.length > 0 && (
                <div className="grid grid-cols-1 divide-y border-t border-border bg-muted/20 sm:grid-cols-3 sm:divide-x sm:divide-y-0 divide-border">
                  <div className="flex items-center gap-2.5 px-6 py-3">
                    <TrendingDown className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cheapest</p>
                      <p className="text-xs font-semibold truncate">{cheapestSupplier?.name} · <span className="font-mono text-primary">{cheapestSupplier?.price}</span></p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 px-6 py-3">
                    <Zap className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Fastest</p>
                      <p className="text-xs font-semibold truncate">{fastestSupplier?.name} · <span className="font-mono">{fastestSupplier?.leadTime}</span></p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 px-6 py-3">
                    {singleSupplierRisk ? (
                      <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
                    ) : (
                      <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sourcing Risk</p>
                      <p className={`text-xs font-semibold truncate ${singleSupplierRisk ? "text-amber-600 dark:text-amber-400" : ""}`}>
                        {singleSupplierRisk ? "Single supplier" : "Diversified"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Stock & Usage */}
        <div className="space-y-6">
          {/* Card 4: Inventory Status Overview */}
          <Card className="border border-border shadow-sm overflow-hidden">
            <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
              <CardTitle className="text-base font-bold">Physical Stock Summary</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="bg-secondary/20 border border-border/60 p-5 rounded-xl space-y-4 shadow-2xs">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">On-hand Total</span>
                  <span className="text-xs font-semibold text-muted-foreground">{component.unit}</span>
                </div>
                <div className="flex items-end justify-between">
                  <div className="text-4xl font-black text-foreground tracking-tight">
                    {calculatedTotalStock.toLocaleString()}
                  </div>
                  <span className={`font-bold inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] ${
                    isHealthy
                      ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                      : "bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive-foreground"
                  }`}>
                    {isHealthy ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                    {isHealthy ? "Healthy" : "Low"}
                  </span>
                </div>

                {/* Stock vs minimum bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
                    <span>Stock vs. minimum</span>
                    <span className="font-mono">{stockPct}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${isHealthy ? "bg-emerald-500" : "bg-destructive"}`} style={{ width: `${stockPct}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-border/50 text-xs">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-muted-foreground font-semibold">Min Stock</span>
                    <span className="font-mono font-bold mt-0.5">{component.minStock.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-muted-foreground font-semibold">Stock Value</span>
                    <span className="font-mono font-bold mt-0.5">{stockValue > 0 ? formatINR(stockValue) : "—"}</span>
                  </div>
                </div>
                {stockValue > 0 && (
                  <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                    Valued at best available unit price ({cheapestSupplier?.price}).
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Card 5: Usage Analysis */}
          <Card className="border border-border shadow-sm h-fit">
            <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
              <div className="flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-primary" />
                <CardTitle className="text-base font-bold">Usage Analysis</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Stat Counters */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1 bg-secondary/50 border border-border/50 p-3 rounded-lg text-center">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground leading-normal font-bold">Used In Products</span>
                  <span className="text-2xl font-black text-foreground">{component.usedInProductsCount}</span>
                </div>
                <div className="flex flex-col gap-1 bg-secondary/50 border border-border/50 p-3 rounded-lg text-center">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground leading-normal font-bold">Used In PCBs</span>
                  <span className="text-2xl font-black text-foreground">{component.usedInPCBsCount}</span>
                </div>
              </div>

              {/* Where Used Struct Hierarchy Tree */}
              <div className="border-t border-border/50 pt-5 space-y-4">
                <h4 className="text-xs uppercase font-extrabold tracking-wider text-muted-foreground">Product Trace Tree</h4>
                <div className="relative pl-4 space-y-6 before:absolute before:left-1.5 before:top-0 before:bottom-3 before:w-[2px] before:bg-border/60">
                  {component.whereUsedTree && component.whereUsedTree.map((node) => (
                    <div key={node.product} className="relative">
                      {/* Product Connector */}
                      <div className="absolute -left-4 top-4 w-4 h-[2px] bg-border/60" />

                      {/* Product Node */}
                      <div className="flex items-center gap-2 bg-secondary/80 border border-border p-2 rounded-lg w-fit text-xs font-semibold relative z-10">
                        <Package className="h-3.5 w-3.5 text-foreground/80" />
                        <span>{node.product}</span>
                      </div>

                      {/* PCB Child Nodes */}
                      {node.pcbs && node.pcbs.length > 0 && (
                        <div className="relative pl-6 mt-1.5 space-y-2 before:absolute before:left-2 before:top-0 before:bottom-2 before:w-[2px] before:border-l before:border-dashed before:border-border">
                          {node.pcbs.map((pcb) => (
                            <div key={pcb} className="relative flex items-center gap-2 group">
                              <div className="absolute -left-6 top-1/2 w-6 h-[2px] border-t border-dashed border-border" />
                              <div className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 bg-background border border-border rounded text-[10px] font-medium text-muted-foreground group-hover:border-primary/50 group-hover:text-foreground transition-all shadow-3xs relative z-10">
                                <Cpu className="h-3 w-3 text-muted-foreground" />
                                <span>{pcb}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modals Container */}
      {activeModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setActiveModal(null)}
        >
          <div 
            className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden scale-100 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border bg-muted/20 px-6 py-4">
              <h3 className="text-lg font-bold text-foreground">
                {activeModal === 'add-supplier' && "Add Supplier Entry"}
                {activeModal === 'edit-price' && "Edit Supplier Agreement Price"}
                {activeModal === 'set-preferred' && "Set Preferred Supplier"}
                {activeModal === 'add-variant' && "Add Approved Variant"}
                {activeModal === 'edit-component' && "Edit Component Details"}
                {activeModal === 'delete-component' && "Confirm Component Deletion"}
              </h3>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-full border-0 bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground"
                onClick={() => setActiveModal(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Edit Component Form */}
            {activeModal === 'edit-component' && (
              <form onSubmit={handleUpdateComponent} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-bold">Category *</label>
                  <select
                    value={editCompCategory}
                    onChange={(e) => setEditCompCategory(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
                  >
                    <option value="Passive">Passive</option>
                    <option value="Passive Components">Passive Components</option>
                    <option value="Optoelectronics">Optoelectronics</option>
                    <option value="Integrated Circuits (IC)">Integrated Circuits (IC)</option>
                    <option value="Mechanical Parts">Mechanical Parts</option>
                    <option value="Connectors font-medium">Connectors</option>
                    <option value="Peripherals">Peripherals</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-bold">Name *</label>
                  <Input 
                    placeholder="e.g. Resistor 10K" 
                    value={editCompName}
                    onChange={(e) => setEditCompName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-bold">Generic Part Number *</label>
                  <Input 
                    placeholder="e.g. RES-10K" 
                    value={editCompGenericPN}
                    onChange={(e) => setEditCompGenericPN(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-bold">Solder Type</label>
                    <select
                      value={editCompSolderType}
                      onChange={(e) => setEditCompSolderType(e.target.value as "SMD" | "DIP")}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
                    >
                      <option value="SMD">SMD</option>
                      <option value="DIP">DIP</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-bold">Footprint</label>
                    <Input 
                      placeholder="e.g. 0603" 
                      value={editCompFootprint}
                      onChange={(e) => setEditCompFootprint(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-bold">SPQ</label>
                  <Input 
                    type="number"
                    placeholder="e.g. 5000" 
                    value={editCompSPQ}
                    onChange={(e) => setEditCompSPQ(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/50">
                  <Button type="button" variant="outline" onClick={() => setActiveModal(null)}>Cancel</Button>
                  <Button type="submit">Save Changes</Button>
                </div>
              </form>
            )}

            {/* Delete Component Confirm Modal */}
            {activeModal === 'delete-component' && (
              <div className="p-6 space-y-4">
                <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/25 p-3 rounded-xl text-destructive text-xs leading-relaxed font-semibold">
                  <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
                  <p>
                    Warning: Deleting <strong>{component.name}</strong> will permanently remove it from the component catalog indexes and local storage catalogs.
                  </p>
                </div>
                <p className="text-sm text-foreground/80 leading-normal font-semibold">
                  Are you sure you want to delete this component?
                </p>
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/50">
                  <Button type="button" variant="outline" onClick={() => setActiveModal(null)}>Cancel</Button>
                  <Button 
                    type="button" 
                    onClick={handleDeleteComponent}
                    className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold"
                  >
                    Delete Permanently
                  </Button>
                </div>
              </div>
            )}

            {/* Add Supplier Form */}
            {activeModal === 'add-supplier' && (
              <form onSubmit={handleAddSupplier} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brand Name</label>
                  <Input 
                    placeholder="e.g. Yageo" 
                    value={newSupplierMfg}
                    onChange={(e) => setNewSupplierMfg(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Supplier Distributor Name</label>
                  <Input 
                    placeholder="e.g. ABC Electronics" 
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Price (₹)</label>
                    <Input 
                      type="number" 
                      step="0.01" 
                      placeholder="e.g. 0.80" 
                      value={newSupplierPrice}
                      onChange={(e) => setNewSupplierPrice(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">MOQ (Units)</label>
                    <Input 
                      type="number" 
                      placeholder="e.g. 1000" 
                      value={newSupplierMOQ}
                      onChange={(e) => setNewSupplierMOQ(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lead Time</label>
                  <Input 
                    placeholder="e.g. 3 Days" 
                    value={newSupplierLeadTime}
                    onChange={(e) => setNewSupplierLeadTime(e.target.value)}
                    required
                  />
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <input 
                    type="checkbox" 
                    id="new-preferred"
                    checked={newSupplierPreferred}
                    onChange={(e) => setNewSupplierPreferred(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <label htmlFor="new-preferred" className="text-sm text-foreground select-none font-medium">Set as preferred supplier choice</label>
                </div>
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/50">
                  <Button type="button" variant="outline" onClick={() => setActiveModal(null)}>Cancel</Button>
                  <Button type="submit">Add Matrix Row</Button>
                </div>
              </form>
            )}

            {/* Edit Supplier Price Form */}
            {activeModal === 'edit-price' && (
              <form onSubmit={handleEditPrice} className="p-6 space-y-4">
                {component.suppliers.length === 0 ? (
                  <div className="py-4 text-center">
                    <p className="text-sm text-muted-foreground mb-4">No suppliers available in current matrix. Please add a supplier first.</p>
                    <Button type="button" variant="outline" onClick={() => setActiveModal(null)}>Close</Button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Supplier Agreement</label>
                      <select 
                        value={editSupplierName} 
                        onChange={(e) => handleEditSupplierChange(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        {component.suppliers.map(s => (
                          <option key={s.name} value={s.name}>{s.manufacturer} — {s.name} ({s.price})</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">New Negotiated Price (₹)</label>
                      <Input 
                        type="number" 
                        step="0.01" 
                        placeholder="e.g. 0.75" 
                        value={editSupplierPrice}
                        onChange={(e) => setEditSupplierPrice(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/50">
                      <Button type="button" variant="outline" onClick={() => setActiveModal(null)}>Cancel</Button>
                      <Button type="submit">Update Price Agreement</Button>
                    </div>
                  </>
                )}
              </form>
            )}

            {/* Set Preferred Supplier Form */}
            {activeModal === 'set-preferred' && (
              <form onSubmit={handleSetPreferred} className="p-6 space-y-4">
                {component.suppliers.length === 0 ? (
                  <div className="py-4 text-center">
                    <p className="text-sm text-muted-foreground mb-4">No suppliers registered. Please add a supplier first.</p>
                    <Button type="button" variant="outline" onClick={() => setActiveModal(null)}>Close</Button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Primary Preferred Supplier</label>
                      <select 
                        value={preferredSupplierName} 
                        onChange={(e) => setPreferredSupplierName(e.target.value)}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        {component.suppliers.map(s => (
                          <option key={s.name} value={s.name}>
                            {s.manufacturer} — {s.name} {s.preferred ? "(Current)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-xs text-muted-foreground leading-normal">
                      Marking a preferred status will designate them as primary contract costing defaults.
                    </p>
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/50">
                      <Button type="button" variant="outline" onClick={() => setActiveModal(null)}>Cancel</Button>
                      <Button type="submit">Confirm Preferred</Button>
                    </div>
                  </>
                )}
              </form>
            )}

            {/* Add Variant Form */}
            {activeModal === 'add-variant' && (
              <form onSubmit={handleAddVariant} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brand Name</label>
                  <Input 
                    placeholder="e.g. Panasonic" 
                    value={newVariantMfg}
                    onChange={(e) => setNewVariantMfg(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brand Part Number</label>
                  <Input 
                    placeholder="e.g. ERJ2RK" 
                    value={newVariantPartNo}
                    onChange={(e) => setNewVariantPartNo(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Initial Stock Quantity</label>
                  <Input 
                    type="number"
                    placeholder="e.g. 1000" 
                    value={newVariantStock}
                    onChange={(e) => setNewVariantStock(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/50">
                  <Button type="button" variant="outline" onClick={() => setActiveModal(null)}>Cancel</Button>
                  <Button type="submit">Register Variant</Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ComponentDetailsPage() {
  return (
    <React.Suspense fallback={
      <div className="flex h-[400px] items-center justify-center text-muted-foreground text-sm font-medium">
        Loading component parameters...
      </div>
    }>
      <ComponentDetailsContent />
    </React.Suspense>
  )
}
