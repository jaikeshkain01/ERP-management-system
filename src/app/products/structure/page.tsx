"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Cpu, ListTree, Nut, Package, ArrowLeft, Layers, Truck, Calculator, X, Award, ShieldCheck, Landmark, Star, Check, AlertCircle } from "lucide-react"
import Link from "next/link"

interface ComponentItem {
  name: string
  type: string
  suppliers: string[]
  qty: number
  brandsCount?: number
  lookupId?: string
}

interface PCBItem {
  name: string
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

const DRAWER_COMPONENTS_DATA: Record<string, DrawerComponentDetail> = {
  "resistor-10k": {
    id: "resistor-10k",
    name: "Resistor 10K",
    category: "Resistor",
    genericPN: "RES-10K",
    stock: 15000,
    minStock: 5000,
    unit: "PCS",
    status: "Healthy",
    description: "10k Ohm metal film resistor, 1/4W, 1% tolerance, axial leaded.",
    brands: [
      { id: "yageo", name: "Yageo", status: "Approved" },
      { id: "vishay", name: "Vishay", status: "Approved" },
      { id: "panasonic", name: "Panasonic", status: "Approved" },
    ],
    suppliers: [
      { id: "abc-electronics", name: "ABC Electronics", price: "₹0.80", leadTime: "3 Days" },
      { id: "xyz-components", name: "XYZ Components", price: "₹0.82", leadTime: "2 Days" },
      { id: "powertech", name: "PowerTech", price: "₹0.90", leadTime: "1 Day" },
    ]
  },
  "capacitor-100uf": {
    id: "capacitor-100uf",
    name: "Capacitor 100uF",
    category: "Capacitor",
    genericPN: "CAP-100UF",
    stock: 8000,
    minStock: 1000,
    unit: "PCS",
    status: "Healthy",
    description: "100uF aluminum electrolytic capacitor, 25V, radial lead, 20% tolerance.",
    brands: [
      { id: "murata", name: "Murata", status: "Approved" },
      { id: "panasonic", name: "Panasonic", status: "Approved" },
    ],
    suppliers: [
      { id: "xyz-components", name: "XYZ Components", price: "₹1.45", leadTime: "4 Days" },
      { id: "powertech", name: "PowerTech", price: "₹1.50", leadTime: "2 Days" },
    ]
  },
  "led-green": {
    id: "led-green",
    name: "LED Green",
    category: "LED",
    genericPN: "LED-GRN",
    stock: 500,
    minStock: 1000,
    unit: "PCS",
    status: "Low",
    description: "5mm green LED light emitting diode, through-hole, 2.1V forward voltage.",
    brands: [
      { id: "everlight", name: "Everlight", status: "Approved" },
      { id: "lite-on", name: "Lite-On", status: "Approved" },
    ],
    suppliers: [
      { id: "xyz-components", name: "XYZ Components", price: "₹2.10", leadTime: "4 Days" },
      { id: "led-depot", name: "LED Depot", price: "₹2.20", leadTime: "2 Days" },
    ]
  },
  "audio-codec": {
    id: "audio-codec",
    name: "Audio Codec",
    category: "IC",
    genericPN: "AUD-CDC",
    stock: 120,
    minStock: 50,
    unit: "PCS",
    status: "Healthy",
    description: "Low-power stereo audio codec with integrated headphone amplifier.",
    brands: [
      { id: "silicon-labs", name: "Silicon Labs", status: "Approved" }
    ],
    suppliers: [
      { id: "abc-electronics", name: "ABC Electronics", price: "₹125.00", leadTime: "3 Days" }
    ]
  },
  "gsm-chip": {
    id: "gsm-chip",
    name: "GSM Chip",
    category: "IC",
    genericPN: "GSM-CHP",
    stock: 85,
    minStock: 20,
    unit: "PCS",
    status: "Healthy",
    description: "Quad-band GSM/GPRS engine module supporting cellular connectivity.",
    brands: [
      { id: "quectel", name: "Quectel", status: "Approved" }
    ],
    suppliers: [
      { id: "xyz-components", name: "XYZ Components", price: "₹375.00", leadTime: "4 Days" }
    ]
  },
  "sim-holder": {
    id: "sim-holder",
    name: "SIM Holder",
    category: "Connector",
    genericPN: "SIM-HLD",
    stock: 300,
    minStock: 100,
    unit: "PCS",
    status: "Healthy",
    description: "6-pin push-push micro SIM card holder connector.",
    brands: [
      { id: "molex", name: "Molex", status: "Approved" }
    ],
    suppliers: [
      { id: "xyz-components", name: "XYZ Components", price: "₹15.00", leadTime: "4 Days" }
    ]
  },
  "display-ic": {
    id: "display-ic",
    name: "Display IC",
    category: "IC",
    genericPN: "DSP-IC",
    stock: 250,
    minStock: 50,
    unit: "PCS",
    status: "Healthy",
    description: "TFT-LCD graphic driver IC with integrated RAM and power circuits.",
    brands: [
      { id: "sitronix", name: "Sitronix", status: "Approved" }
    ],
    suppliers: [
      { id: "semiconductors-corp", name: "Semiconductors Corp", price: "₹85.00", leadTime: "5 Days" }
    ]
  },
  "dsp-chip": {
    id: "dsp-chip",
    name: "DSP Chip",
    category: "IC",
    genericPN: "DSP-CHP",
    stock: 230,
    minStock: 50,
    unit: "PCS",
    status: "Healthy",
    description: "High-performance digital signal processor, 32-bit floating point, 400MHz.",
    brands: [
      { id: "ti", name: "Texas Instruments", status: "Approved" },
      { id: "analog-devices", name: "Analog Devices", status: "Approved" }
    ],
    suppliers: [
      { id: "mouser", name: "Mouser", price: "₹240.00", leadTime: "5 Days" }
    ]
  },
  "microcontroller": {
    id: "microcontroller",
    name: "Microcontroller",
    category: "MCU",
    genericPN: "MCU-STM32",
    stock: 450,
    minStock: 100,
    unit: "PCS",
    status: "Healthy",
    description: "STM32F4 series ARM Cortex-M4 32-bit MCU, 168 MHz, 1 MB Flash.",
    brands: [
      { id: "st", name: "STMicroelectronics", status: "Approved" }
    ],
    suppliers: [
      { id: "arrow", name: "Arrow Electronics", price: "₹185.00", leadTime: "3 Days" }
    ]
  },
  "connectors": {
    id: "connectors",
    name: "Connectors",
    category: "Connector",
    genericPN: "CON-HDR",
    stock: 1200,
    minStock: 300,
    unit: "PCS",
    status: "Healthy",
    description: "2.54mm pitch double row pin header connector, gold plated, 40-pin.",
    brands: [
      { id: "molex", name: "Molex", status: "Approved" },
      { id: "amphenol", name: "Amphenol", status: "Approved" }
    ],
    suppliers: [
      { id: "xyz-components", name: "XYZ Components", price: "₹12.00", leadTime: "2 Days" }
    ]
  },
  "flash-memory": {
    id: "flash-memory",
    name: "Flash Memory",
    category: "IC",
    genericPN: "MEM-FLSH",
    stock: 340,
    minStock: 80,
    unit: "PCS",
    status: "Healthy",
    description: "64M-bit serial flash memory with dual and quad SPI, SOIC-8.",
    brands: [
      { id: "winbond", name: "Winbond", status: "Approved" },
      { id: "micron", name: "Micron", status: "Approved" }
    ],
    suppliers: [
      { id: "mouser", name: "Mouser", price: "₹45.00", leadTime: "4 Days" }
    ]
  },
  "sd-card-slot": {
    id: "sd-card-slot",
    name: "SD Card Slot",
    category: "Connector",
    genericPN: "CON-SD",
    stock: 180,
    minStock: 50,
    unit: "PCS",
    status: "Healthy",
    description: "Micro SD card connector hinge type, 8-pin SMT.",
    brands: [
      { id: "molex", name: "Molex", status: "Approved" }
    ],
    suppliers: [
      { id: "xyz-components", name: "XYZ Components", price: "₹18.00", leadTime: "3 Days" }
    ]
  },
  "usb-controller": {
    id: "usb-controller",
    name: "USB Controller",
    category: "IC",
    genericPN: "IC-USB",
    stock: 290,
    minStock: 60,
    unit: "PCS",
    status: "Healthy",
    description: "USB 2.0 to UART bridge controller, integrated clock and voltage regulator.",
    brands: [
      { id: "ftdi", name: "FTDI Chip", status: "Approved" },
      { id: "silicon-labs", name: "Silicon Labs", status: "Approved" }
    ],
    suppliers: [
      { id: "abc-electronics", name: "ABC Electronics", price: "₹65.00", leadTime: "3 Days" }
    ]
  }
}

const PRODUCTS_DATA: Record<string, ProductData> = {
  "roip-400": {
    name: "ROIP 400",
    code: "ROIP400",
    version: "1.0",
    pcbsCount: 4,
    uniqueComponentsCount: 285,
    totalComponentsCount: 1248,
    estimatedCost: "₹18,450",
    description: "Radio over IP Gateway Terminal",
    structure: [
      {
        name: "Audio PCB",
        components: [
          { name: "Resistor 10K", type: "Passive", suppliers: ["ABC Electronics", "XYZ Components", "PowerTech"], qty: 20, brandsCount: 3, lookupId: "resistor-10k" },
          { name: "Capacitor 100uF", type: "Passive", suppliers: ["ABC Electronics", "Delta Components"], qty: 10, brandsCount: 2, lookupId: "capacitor-100uf" },
          { name: "Audio Codec", type: "IC", suppliers: ["Texas Supplier", "India Electronics"], qty: 1, brandsCount: 1, lookupId: "audio-codec" },
        ],
      },
      {
        name: "GSM PCB",
        components: [
          { name: "GSM Chip", type: "IC", suppliers: ["Semiconductors Corp", "XYZ Components"], qty: 1, brandsCount: 1, lookupId: "gsm-chip" },
          { name: "SIM Holder", type: "Connector", suppliers: ["Delta Components"], qty: 1, brandsCount: 1, lookupId: "sim-holder" },
          { name: "Capacitor 100uF", type: "Passive", suppliers: ["PowerTech", "ABC Electronics"], qty: 15, brandsCount: 2, lookupId: "capacitor-100uf" },
        ],
      },
      {
        name: "Display PCB",
        components: [
          { name: "Display IC", type: "IC", suppliers: ["Semiconductors Corp"], qty: 1, brandsCount: 1, lookupId: "display-ic" },
          { name: "LED Green", type: "Optoelectronics", suppliers: ["LED Depot", "ABC Electronics"], qty: 5, brandsCount: 2, lookupId: "led-green" },
        ],
      },
    ],
  },
  "voice-logger": {
    name: "Voice Logger",
    code: "VLG200",
    version: "1.2",
    pcbsCount: 3,
    uniqueComponentsCount: 160,
    totalComponentsCount: 750,
    estimatedCost: "₹12,800",
    description: "Multi-channel voice recording system",
    structure: [
      {
        name: "Main PCB",
        components: [
          { name: "DSP Chip", type: "IC", suppliers: ["Semiconductors Corp", "Texas Supplier"], qty: 1, brandsCount: 1, lookupId: "dsp-chip" },
          { name: "Microcontroller", type: "MCU", suppliers: ["Semiconductors Corp", "India Electronics"], qty: 1, brandsCount: 1, lookupId: "microcontroller" },
          { name: "Connectors", type: "Connector", suppliers: ["Delta Components", "XYZ Components"], qty: 4, brandsCount: 1, lookupId: "connectors" },
        ],
      },
      {
        name: "Memory PCB",
        components: [
          { name: "Flash Memory", type: "IC", suppliers: ["Semiconductors Corp"], qty: 2, brandsCount: 1, lookupId: "flash-memory" },
          { name: "SD Card Slot", type: "Connector", suppliers: ["Delta Components"], qty: 1, brandsCount: 1, lookupId: "sd-card-slot" },
          { name: "Resistor 10K", type: "Passive", suppliers: ["ABC Electronics", "XYZ Components", "PowerTech"], qty: 12, brandsCount: 3, lookupId: "resistor-10k" },
        ],
      },
      {
        name: "Interface PCB",
        components: [
          { name: "USB Controller", type: "IC", suppliers: ["Semiconductors Corp"], qty: 1, brandsCount: 1, lookupId: "usb-controller" },
          { name: "LED Green", type: "Optoelectronics", suppliers: ["LED Depot"], qty: 3, brandsCount: 2, lookupId: "led-green" },
        ],
      },
    ],
  },
}

function ProductStructureContent() {
  const searchParams = useSearchParams()
  const productId = searchParams.get("product") || "roip-400"
  
  const [buildQty, setBuildQty] = React.useState(1)
  const [selectedCompId, setSelectedCompId] = React.useState<string | null>(null)
  const [expandedComponents, setExpandedComponents] = React.useState<Record<string, boolean>>({})
  
  // Default to roip-400 if product key is invalid
  const product = PRODUCTS_DATA[productId] || PRODUCTS_DATA["roip-400"]

  const handleComponentClick = (comp: ComponentItem) => {
    if (comp.lookupId && DRAWER_COMPONENTS_DATA[comp.lookupId]) {
      setSelectedCompId(comp.lookupId)
    }
  }

  const toggleComponentExpand = (key: string) => {
    setExpandedComponents(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  const selectedComponentDetail = selectedCompId ? DRAWER_COMPONENTS_DATA[selectedCompId] : null

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
        <Button 
          variant="outline" 
          render={<Link href="/products/list" />}
          className="gap-2 self-start sm:self-auto border-border bg-background cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to List</span>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Tree Panel (Hero) */}
        <Card className="lg:col-span-2 border border-border shadow-sm">
          <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
            <div className="flex items-center gap-2">
              <ListTree className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg font-bold">Assembly Tree</CardTitle>
                <CardDescription>Visual breakdown of {product.name} components. Click on a component to view specifications.</CardDescription>
              </div>
            </div>
          </CardHeader>
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
                    </div>

                    {/* PCB Child Component Nodes */}
                    {pcb.components && pcb.components.length > 0 && (
                      <div className="relative pl-8 mt-2 space-y-5 before:absolute before:left-3.5 before:top-0 before:bottom-3 before:w-[2px] before:border-l-2 before:border-dashed before:border-border">
                        {pcb.components.map((component, compIdx) => {
                          const isClickable = !!component.lookupId && !!DRAWER_COMPONENTS_DATA[component.lookupId]
                          const detail = component.lookupId ? DRAWER_COMPONENTS_DATA[component.lookupId] : null
                          
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
                  <span className="text-xl font-extrabold text-foreground">{product.name}</span>
                </div>
                
                <div className="flex flex-col gap-1 border-t border-border/50 pt-3">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Description</span>
                  <span className="text-sm text-muted-foreground leading-normal">{product.description}</span>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-border/50 pt-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Code</span>
                    <span className="font-mono font-bold text-foreground text-sm">{product.code}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Version</span>
                    <span className="font-semibold text-foreground text-sm">{product.version}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-border/50 pt-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">PCBs Used</span>
                    <span className="font-bold text-foreground text-sm">{product.pcbsCount}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Unique Components</span>
                    <span className="font-bold text-foreground text-sm">{product.uniqueComponentsCount}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-border/50 pt-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Total Components</span>
                    <span className="font-bold text-foreground text-sm">{product.totalComponentsCount.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Estimated Cost</span>
                    <span className="font-bold text-primary text-sm font-mono">{product.estimatedCost}</span>
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
