"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Cpu, ListTree, Nut, ArrowLeft, Layers, Landmark, Award, X, ShieldCheck, Calculator, Star, Check, AlertCircle, Truck } from "lucide-react"
import Link from "next/link"

interface ComponentBrand {
  id: string
  name: string
}

interface ComponentItem {
  name: string
  type: string
  qty: number
  approvedBrands?: ComponentBrand[]
  lookupId?: string
}

interface PCBData {
  name: string
  componentsCount: number
  stockCount: number
  usedIn: string[]
  description: string
  components: ComponentItem[]
}

interface DrawerComponentDetail {
  id: string
  name: string
  category: string
  stock: number
  minStock: number
  unit: string
  status: "Healthy" | "Low"
  description: string
  brands: { id: string; name: string; status: string }[]
  suppliers: { id: string; name: string; price: string; leadTime: string }[]
}

// --- Drawer data for component detail slide-out ---
const DRAWER_COMPONENTS_DATA: Record<string, DrawerComponentDetail> = {
  "audio-codec": {
    id: "audio-codec",
    name: "Audio Codec",
    category: "IC",
    stock: 120,
    minStock: 50,
    unit: "PCS",
    status: "Healthy",
    description: "Low-power stereo audio codec with integrated headphone amplifier and programmable PGA.",
    brands: [
      { id: "silicon-labs", name: "Silicon Labs", status: "Approved" },
    ],
    suppliers: [
      { id: "abc-electronics", name: "ABC Electronics", price: "₹125.00", leadTime: "3 Days" },
      { id: "semiconductors-corp", name: "Semiconductors Corp", price: "₹130.00", leadTime: "5 Days" },
    ],
  },
  "resistor-10k": {
    id: "resistor-10k",
    name: "Resistor 10K",
    category: "Resistor",
    stock: 15000,
    minStock: 5000,
    unit: "PCS",
    status: "Healthy",
    description: "10k Ohm metal film resistor, 1/4W, 1% tolerance, axial leaded.",
    brands: [
      { id: "yageo", name: "Yageo", status: "Approved" },
      { id: "vishay", name: "Vishay", status: "Approved" },
    ],
    suppliers: [
      { id: "abc-electronics", name: "ABC Electronics", price: "₹0.80", leadTime: "3 Days" },
      { id: "xyz-components", name: "XYZ Components", price: "₹0.82", leadTime: "2 Days" },
      { id: "powertech", name: "PowerTech", price: "₹0.90", leadTime: "1 Day" },
    ],
  },
  "capacitor-100uf": {
    id: "capacitor-100uf",
    name: "Capacitor 100uF",
    category: "Capacitor",
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
    ],
  },
  "led-green": {
    id: "led-green",
    name: "LED Green",
    category: "LED",
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
    ],
  },
  "connector": {
    id: "connector",
    name: "Connector",
    category: "Mechanical",
    stock: 3200,
    minStock: 500,
    unit: "PCS",
    status: "Healthy",
    description: "PCB-mount multi-pin I/O connector, gold-plated contacts, right-angle.",
    brands: [
      { id: "amphenol", name: "Amphenol", status: "Approved" },
    ],
    suppliers: [
      { id: "xyz-components", name: "XYZ Components", price: "₹18.00", leadTime: "3 Days" },
      { id: "delta-components", name: "Delta Components", price: "₹19.50", leadTime: "4 Days" },
    ],
  },
  "gsm-chip": {
    id: "gsm-chip",
    name: "GSM Chip",
    category: "IC",
    stock: 85,
    minStock: 20,
    unit: "PCS",
    status: "Healthy",
    description: "Quad-band GSM/GPRS engine module supporting cellular connectivity.",
    brands: [
      { id: "quectel", name: "Quectel", status: "Approved" },
    ],
    suppliers: [
      { id: "xyz-components", name: "XYZ Components", price: "₹375.00", leadTime: "4 Days" },
    ],
  },
  "sim-holder": {
    id: "sim-holder",
    name: "SIM Holder",
    category: "Connector",
    stock: 300,
    minStock: 100,
    unit: "PCS",
    status: "Healthy",
    description: "6-pin push-push micro SIM card holder connector.",
    brands: [
      { id: "molex", name: "Molex", status: "Approved" },
    ],
    suppliers: [
      { id: "xyz-components", name: "XYZ Components", price: "₹15.00", leadTime: "4 Days" },
    ],
  },
  "capacitor-10uf": {
    id: "capacitor-10uf",
    name: "Capacitor 10uF",
    category: "Capacitor",
    stock: 12000,
    minStock: 2000,
    unit: "PCS",
    status: "Healthy",
    description: "10uF ceramic multilayer capacitor, 50V, X7R dielectric, 0805 SMD.",
    brands: [
      { id: "murata", name: "Murata", status: "Approved" },
      { id: "panasonic", name: "Panasonic", status: "Approved" },
    ],
    suppliers: [
      { id: "abc-electronics", name: "ABC Electronics", price: "₹0.60", leadTime: "2 Days" },
      { id: "powertech", name: "PowerTech", price: "₹0.65", leadTime: "1 Day" },
    ],
  },
  "antenna-connector": {
    id: "antenna-connector",
    name: "Antenna Connector",
    category: "RF",
    stock: 450,
    minStock: 100,
    unit: "PCS",
    status: "Healthy",
    description: "SMA female bulkhead antenna connector, 50 ohm impedance, gold-plated.",
    brands: [
      { id: "amphenol", name: "Amphenol", status: "Approved" },
    ],
    suppliers: [
      { id: "xyz-components", name: "XYZ Components", price: "₹22.00", leadTime: "3 Days" },
    ],
  },
  "display-ic": {
    id: "display-ic",
    name: "Display IC",
    category: "IC",
    stock: 250,
    minStock: 50,
    unit: "PCS",
    status: "Healthy",
    description: "TFT-LCD graphic driver IC with integrated RAM and power circuits.",
    brands: [
      { id: "sitronix", name: "Sitronix", status: "Approved" },
    ],
    suppliers: [
      { id: "semiconductors-corp", name: "Semiconductors Corp", price: "₹85.00", leadTime: "5 Days" },
    ],
  },
  "led-backlight-driver": {
    id: "led-backlight-driver",
    name: "LED Backlight Driver",
    category: "IC",
    stock: 200,
    minStock: 40,
    unit: "PCS",
    status: "Healthy",
    description: "High-efficiency LED backlight driver IC with dimming control capability.",
    brands: [
      { id: "texas-instruments", name: "Texas Instruments", status: "Approved" },
    ],
    suppliers: [
      { id: "abc-electronics", name: "ABC Electronics", price: "₹42.00", leadTime: "3 Days" },
    ],
  },
  "leds": {
    id: "leds",
    name: "LEDs",
    category: "Opto",
    stock: 6000,
    minStock: 1500,
    unit: "PCS",
    status: "Healthy",
    description: "Surface-mount white LED for LCD backlight array, 3528 package.",
    brands: [
      { id: "lite-on", name: "Lite-On", status: "Approved" },
      { id: "everlight", name: "Everlight", status: "Approved" },
    ],
    suppliers: [
      { id: "led-depot", name: "LED Depot", price: "₹1.80", leadTime: "2 Days" },
      { id: "xyz-components", name: "XYZ Components", price: "₹1.95", leadTime: "3 Days" },
    ],
  },
  "ribbon-connector": {
    id: "ribbon-connector",
    name: "Ribbon Connector",
    category: "Mechanical",
    stock: 800,
    minStock: 200,
    unit: "PCS",
    status: "Healthy",
    description: "40-pin ZIF FPC/FFC ribbon cable connector for LCD display interface.",
    brands: [
      { id: "amphenol", name: "Amphenol", status: "Approved" },
    ],
    suppliers: [
      { id: "delta-components", name: "Delta Components", price: "₹12.00", leadTime: "4 Days" },
    ],
  },
  "power-ic": {
    id: "power-ic",
    name: "Power IC",
    category: "IC",
    stock: 180,
    minStock: 40,
    unit: "PCS",
    status: "Healthy",
    description: "Multi-output DC-DC switching regulator with integrated MOSFETs.",
    brands: [
      { id: "texas-instruments", name: "Texas Instruments", status: "Approved" },
    ],
    suppliers: [
      { id: "abc-electronics", name: "ABC Electronics", price: "₹95.00", leadTime: "3 Days" },
      { id: "semiconductors-corp", name: "Semiconductors Corp", price: "₹98.00", leadTime: "5 Days" },
    ],
  },
  "inductor-4.7uh": {
    id: "inductor-4.7uh",
    name: "Inductor 4.7uH",
    category: "Passive",
    stock: 4500,
    minStock: 1000,
    unit: "PCS",
    status: "Healthy",
    description: "4.7μH shielded power inductor, 3A saturation current, SMD 6×6mm.",
    brands: [
      { id: "tdk", name: "TDK", status: "Approved" },
    ],
    suppliers: [
      { id: "abc-electronics", name: "ABC Electronics", price: "₹3.20", leadTime: "3 Days" },
    ],
  },
  "capacitors-22uf": {
    id: "capacitors-22uf",
    name: "Capacitors 22uF",
    category: "Passive",
    stock: 9500,
    minStock: 2000,
    unit: "PCS",
    status: "Healthy",
    description: "22uF ceramic capacitor, 16V, X5R dielectric, 1206 package.",
    brands: [
      { id: "murata", name: "Murata", status: "Approved" },
      { id: "panasonic", name: "Panasonic", status: "Approved" },
    ],
    suppliers: [
      { id: "powertech", name: "PowerTech", price: "₹1.10", leadTime: "2 Days" },
      { id: "abc-electronics", name: "ABC Electronics", price: "₹1.15", leadTime: "3 Days" },
    ],
  },
  "fuse-2a": {
    id: "fuse-2a",
    name: "Fuse 2A",
    category: "Protection",
    stock: 2200,
    minStock: 500,
    unit: "PCS",
    status: "Healthy",
    description: "2A fast-blow SMD fuse, 32V rating, 1206 package size.",
    brands: [
      { id: "littelfuse", name: "Littelfuse", status: "Approved" },
    ],
    suppliers: [
      { id: "xyz-components", name: "XYZ Components", price: "₹5.50", leadTime: "3 Days" },
    ],
  },
  "dsp-chip": {
    id: "dsp-chip",
    name: "DSP Chip",
    category: "IC",
    stock: 60,
    minStock: 15,
    unit: "PCS",
    status: "Healthy",
    description: "High-performance fixed-point DSP with dual MAC units and 256KB on-chip memory.",
    brands: [
      { id: "analog-devices", name: "Analog Devices", status: "Approved" },
    ],
    suppliers: [
      { id: "semiconductors-corp", name: "Semiconductors Corp", price: "₹450.00", leadTime: "7 Days" },
    ],
  },
  "microcontroller": {
    id: "microcontroller",
    name: "Microcontroller",
    category: "MCU",
    stock: 95,
    minStock: 20,
    unit: "PCS",
    status: "Healthy",
    description: "ARM Cortex-M4 MCU with 512KB flash, 128KB SRAM, hardware FPU.",
    brands: [
      { id: "stmicroelectronics", name: "STMicroelectronics", status: "Approved" },
    ],
    suppliers: [
      { id: "semiconductors-corp", name: "Semiconductors Corp", price: "₹280.00", leadTime: "5 Days" },
      { id: "abc-electronics", name: "ABC Electronics", price: "₹285.00", leadTime: "4 Days" },
    ],
  },
  "sram-512kb": {
    id: "sram-512kb",
    name: "SRAM 512KB",
    category: "Memory",
    stock: 140,
    minStock: 30,
    unit: "PCS",
    status: "Healthy",
    description: "512KB asynchronous SRAM, 10ns access time, 3.3V, 44-pin TSOP.",
    brands: [
      { id: "infineon", name: "Infineon", status: "Approved" },
    ],
    suppliers: [
      { id: "semiconductors-corp", name: "Semiconductors Corp", price: "₹75.00", leadTime: "5 Days" },
    ],
  },
  "oscillator-24mhz": {
    id: "oscillator-24mhz",
    name: "Oscillator 24MHz",
    category: "Frequency",
    stock: 320,
    minStock: 50,
    unit: "PCS",
    status: "Healthy",
    description: "24MHz crystal oscillator, ±20ppm stability, 3.3V, 4-pin SMD.",
    brands: [
      { id: "kyocera", name: "Kyocera", status: "Approved" },
    ],
    suppliers: [
      { id: "abc-electronics", name: "ABC Electronics", price: "₹18.00", leadTime: "3 Days" },
    ],
  },
}

const PCBS_DATA: Record<string, PCBData> = {
  "audio-pcb": {
    name: "Audio PCB",
    description: "Voice and audio signal processing board",
    componentsCount: 58,
    stockCount: 120,
    usedIn: ["ROIP400", "Voice Logger"],
    components: [
      { name: "Audio Codec", type: "IC", qty: 1, approvedBrands: [{ id: "silicon-labs", name: "Silicon Labs" }], lookupId: "audio-codec" },
      { name: "Resistor 10K", type: "Passive", qty: 20, approvedBrands: [{ id: "yageo", name: "Yageo" }, { id: "vishay", name: "Vishay" }], lookupId: "resistor-10k" },
      { name: "Capacitor 100uF", type: "Passive", qty: 10, approvedBrands: [{ id: "murata", name: "Murata" }, { id: "panasonic", name: "Panasonic" }], lookupId: "capacitor-100uf" },
      { name: "LED Green", type: "Opto", qty: 4, approvedBrands: [{ id: "everlight", name: "Everlight" }, { id: "lite-on", name: "Lite-On" }], lookupId: "led-green" },
      { name: "Connector", type: "Mechanical", qty: 3, approvedBrands: [{ id: "amphenol", name: "Amphenol" }], lookupId: "connector" },
    ],
  },
  "gsm-pcb": {
    name: "GSM PCB",
    description: "Mobile network connectivity module board",
    componentsCount: 75,
    stockCount: 80,
    usedIn: ["ROIP400"],
    components: [
      { name: "GSM Chip", type: "IC", qty: 1, approvedBrands: [{ id: "quectel", name: "Quectel" }], lookupId: "gsm-chip" },
      { name: "SIM Holder", type: "Connector", qty: 1, approvedBrands: [{ id: "molex", name: "Molex" }], lookupId: "sim-holder" },
      { name: "Capacitor 10uF", type: "Passive", qty: 15, approvedBrands: [{ id: "murata", name: "Murata" }, { id: "panasonic", name: "Panasonic" }], lookupId: "capacitor-10uf" },
      { name: "Antenna Connector", type: "RF", qty: 2, approvedBrands: [{ id: "amphenol", name: "Amphenol" }], lookupId: "antenna-connector" },
    ],
  },
  "display-pcb": {
    name: "Display PCB",
    description: "LCD screen driver interface board",
    componentsCount: 40,
    stockCount: 150,
    usedIn: ["ROIP400"],
    components: [
      { name: "Display IC", type: "IC", qty: 1, approvedBrands: [{ id: "sitronix", name: "Sitronix" }], lookupId: "display-ic" },
      { name: "LED Backlight Driver", type: "IC", qty: 1, approvedBrands: [{ id: "texas-instruments", name: "Texas Instruments" }], lookupId: "led-backlight-driver" },
      { name: "LEDs", type: "Opto", qty: 12, approvedBrands: [{ id: "lite-on", name: "Lite-On" }, { id: "everlight", name: "Everlight" }], lookupId: "leds" },
      { name: "Ribbon Connector", type: "Mechanical", qty: 1, approvedBrands: [{ id: "amphenol", name: "Amphenol" }], lookupId: "ribbon-connector" },
    ],
  },
  "power-pcb": {
    name: "Power PCB",
    description: "Voltage regulation and power distribution board",
    componentsCount: 32,
    stockCount: 200,
    usedIn: ["ROIP400"],
    components: [
      { name: "Power IC", type: "IC", qty: 1, approvedBrands: [{ id: "texas-instruments", name: "Texas Instruments" }], lookupId: "power-ic" },
      { name: "Inductor 4.7uH", type: "Passive", qty: 3, approvedBrands: [{ id: "tdk", name: "TDK" }], lookupId: "inductor-4.7uh" },
      { name: "Capacitors 22uF", type: "Passive", qty: 8, approvedBrands: [{ id: "murata", name: "Murata" }, { id: "panasonic", name: "Panasonic" }], lookupId: "capacitors-22uf" },
      { name: "Fuse 2A", type: "Protection", qty: 2, approvedBrands: [{ id: "littelfuse", name: "Littelfuse" }], lookupId: "fuse-2a" },
    ],
  },
  "main-pcb": {
    name: "Main PCB",
    description: "Primary controller and DSP board",
    componentsCount: 80,
    stockCount: 50,
    usedIn: ["Voice Logger"],
    components: [
      { name: "DSP Chip", type: "IC", qty: 1, approvedBrands: [{ id: "analog-devices", name: "Analog Devices" }], lookupId: "dsp-chip" },
      { name: "Microcontroller", type: "MCU", qty: 1, approvedBrands: [{ id: "stmicroelectronics", name: "STMicroelectronics" }], lookupId: "microcontroller" },
      { name: "SRAM 512KB", type: "Memory", qty: 2, approvedBrands: [{ id: "infineon", name: "Infineon" }], lookupId: "sram-512kb" },
      { name: "Oscillator 24MHz", type: "Frequency", qty: 1, approvedBrands: [{ id: "kyocera", name: "Kyocera" }], lookupId: "oscillator-24mhz" },
    ],
  },
}

function PCBStructureContent() {
  const searchParams = useSearchParams()
  const pcbId = searchParams.get("pcb") || "audio-pcb"
  const [buildQty, setBuildQty] = React.useState(1)
  const [selectedCompId, setSelectedCompId] = React.useState<string | null>(null)

  // Fallback to audio-pcb if invalid pcbId
  const pcb = PCBS_DATA[pcbId] || PCBS_DATA["audio-pcb"]

  const handleComponentClick = (comp: ComponentItem) => {
    if (comp.lookupId && DRAWER_COMPONENTS_DATA[comp.lookupId]) {
      setSelectedCompId(comp.lookupId)
    }
  }

  const selectedComponentDetail = selectedCompId ? DRAWER_COMPONENTS_DATA[selectedCompId] : null

  // Compute total component instances
  const totalParts = pcb.components.reduce((sum, c) => sum + c.qty, 0)

  return (
    <div className="space-y-6 relative">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <span>PCB Management</span>
            <span>/</span>
            <span className="text-foreground font-medium">PCB Structure</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">PCB Structure</h1>
          <p className="text-muted-foreground">
            Component composition, quantities, and bill of materials breakdown.
          </p>
        </div>
        <Button 
          variant="outline" 
          render={<Link href="/pcb-management/list" />}
          className="gap-2 self-start sm:self-auto border-border bg-background cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to List</span>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Tree Panel */}
        <Card className="lg:col-span-2 border border-border shadow-sm">
          <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
            <div className="flex items-center gap-2">
              <ListTree className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg font-bold">PCB Component Tree</CardTitle>
                <CardDescription>Visual breakdown of {pcb.name} parts with quantities. Click a component to view details.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 md:p-8 overflow-x-auto">
            {/* Root Node */}
            <div className="space-y-6">
              <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 p-3 rounded-lg w-fit shadow-xs">
                <Cpu className="h-5 w-5 text-primary" />
                <span className="font-extrabold text-primary text-sm uppercase tracking-wider">{pcb.name}</span>
                {buildQty > 1 && (
                  <span className="text-xs font-bold text-amber-600 bg-amber-500/10 px-2.5 py-0.5 rounded-full">
                    Build Qty: {buildQty.toLocaleString()} units
                  </span>
                )}
              </div>

              {/* Children Component Nodes */}
              <div className="relative pl-6 space-y-5 before:absolute before:left-3.5 before:top-0 before:bottom-6 before:w-[2px] before:border-l-2 before:border-dashed before:border-border">
                {pcb.components.map((component) => {
                  const isClickable = !!component.lookupId && !!DRAWER_COMPONENTS_DATA[component.lookupId]
                  return (
                    <div key={component.name} className="relative flex items-start gap-3.5 group">
                      {/* Connection Line */}
                      <div className="absolute -left-6 top-4.5 w-6 h-[2px] border-t-2 border-dashed border-border group-hover:border-primary/50 transition-colors" />
                      
                      <div className="flex flex-col gap-1.5 w-full max-w-lg">
                        {/* Component Card */}
                        <div 
                          onClick={() => isClickable && handleComponentClick(component)}
                          className={`flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-lg text-xs font-semibold text-foreground transition-all shadow-2xs relative z-10 w-fit select-none ${
                            isClickable
                              ? "cursor-pointer hover:border-primary/60 hover:shadow-xs group-hover:border-primary/50"
                              : ""
                          }`}
                        >
                          <Nut className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                          <span>{component.name}</span>
                          {/* Quantity badge */}
                          <span className="font-mono text-primary font-bold ml-1 text-[11px]">
                            × {component.qty}
                          </span>
                          {buildQty > 1 && (
                            <span className="font-mono text-amber-600 dark:text-amber-500 font-bold ml-1 text-[11px] bg-amber-500/10 px-1 rounded">
                              ({(component.qty * buildQty).toLocaleString()} req.)
                            </span>
                          )}
                          <span className="text-[10px] uppercase font-bold text-muted-foreground/45 bg-muted px-1.5 py-0.5 rounded ml-2 font-mono">
                            {component.type}
                          </span>
                        </div>

                        {/* Approved Brands Leaf Node */}
                        {component.approvedBrands && component.approvedBrands.length > 0 && (
                          <div className="pl-6 flex flex-col gap-1 text-[11px] text-muted-foreground border-l border-dashed border-border/80 ml-3.5 py-0.5 animate-in fade-in duration-300">
                            <span className="font-semibold text-[10px] uppercase text-muted-foreground/50 tracking-wider flex items-center gap-1">
                              Approved Brands:
                              <span className="text-primary font-extrabold">{component.approvedBrands.length}</span>
                            </span>
                            <div className="flex flex-wrap gap-1.5 mt-0.5">
                              {component.approvedBrands.map(b => (
                                <Link 
                                  key={b.id}
                                  href={`/brands/list?brand=${b.id}`}
                                  className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 font-bold text-secondary-foreground hover:text-primary hover:bg-primary/5 border border-border transition-colors cursor-pointer"
                                >
                                  <Award className="h-3 w-3 text-primary" />
                                  <span>{b.name}</span>
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Summary + Calculator Panel */}
        <div className="space-y-6">
          {/* Summary Card */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg font-bold">PCB Summary</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">PCB Name</span>
                  <span className="text-xl font-extrabold text-foreground">{pcb.name}</span>
                </div>

                <div className="flex flex-col gap-1 border-t border-border/50 pt-3">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Description</span>
                  <span className="text-sm text-muted-foreground leading-normal">{pcb.description}</span>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-border/50 pt-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Unique Components</span>
                    <span className="font-bold text-foreground text-sm">{pcb.components.length}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">Total Parts</span>
                    <span className="font-bold text-foreground text-sm">{totalParts}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-border/50 pt-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">PCB Stock</span>
                    <span className="font-bold text-foreground text-sm">{pcb.stockCount} Units</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground/60 font-semibold">BOM Lines</span>
                    <span className="font-bold text-foreground text-sm">{pcb.componentsCount}</span>
                  </div>
                </div>

                <div className="space-y-2 border-t border-border/50 pt-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 block">Used In Products</span>
                  <div className="flex flex-wrap gap-1.5">
                    {pcb.usedIn.map((product) => (
                      <span 
                        key={product} 
                        className="inline-flex items-center rounded-md bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground border border-border"
                      >
                        <Landmark className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
                        {product}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* BOM Quantity Table */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
              <div className="flex items-center gap-2">
                <Nut className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg font-bold">Bill of Materials</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="border-border overflow-hidden text-xs">
                <table className="w-full text-left text-foreground">
                  <thead className="bg-muted/40 text-muted-foreground border-b border-border text-[10px] uppercase font-semibold">
                    <tr>
                      <th scope="col" className="px-4 py-2.5">Component</th>
                      <th scope="col" className="px-4 py-2.5 text-center">Qty / PCB</th>
                      {buildQty > 1 && (
                        <th scope="col" className="px-4 py-2.5 text-right">Total Req.</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pcb.components.map((c) => (
                      <tr key={c.name} className="hover:bg-muted/5">
                        <td className="px-4 py-2.5 font-semibold">{c.name}</td>
                        <td className="px-4 py-2.5 text-center font-mono font-bold text-primary">{c.qty}</td>
                        {buildQty > 1 && (
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-amber-600">
                            {(c.qty * buildQty).toLocaleString()}
                          </td>
                        )}
                      </tr>
                    ))}
                    <tr className="bg-muted/30 font-bold">
                      <td className="px-4 py-2.5 uppercase text-[10px] tracking-wider text-muted-foreground">Total</td>
                      <td className="px-4 py-2.5 text-center font-mono text-primary">{totalParts}</td>
                      {buildQty > 1 && (
                        <td className="px-4 py-2.5 text-right font-mono text-amber-600">
                          {(totalParts * buildQty).toLocaleString()}
                        </td>
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Build Calculator */}
          <Card className="border border-border shadow-sm">
            <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg font-bold">Build Calculator</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">PCB Build Target Quantity</label>
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
                  Set target build quantity to scale all component requirements across the BOM.
                </p>
              </div>

              {buildQty > 1 && (
                <div className="bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/10 dark:border-amber-500/20 rounded-lg p-3 space-y-2">
                  <span className="text-[10px] uppercase font-bold text-amber-600 block">Scaled Requirement:</span>
                  <div className="text-xs font-semibold text-muted-foreground">
                    {pcb.components[0]?.name}: <span className="font-mono text-foreground font-bold">{pcb.components[0]?.qty}</span> × <span className="font-mono text-foreground font-bold">{buildQty.toLocaleString()}</span> = <span className="font-mono text-amber-600 font-bold">{((pcb.components[0]?.qty || 0) * buildQty).toLocaleString()} required</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ===== Component Details Slide-out Drawer ===== */}
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
                <h3 className="text-lg font-bold text-foreground">Component Details</h3>
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

            {/* Approved Manufacturer Brands Section */}
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
                <Truck className="h-4 w-4 text-primary" />
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

export default function PCBStructurePage() {
  return (
    <React.Suspense fallback={
      <div className="flex h-[400px] items-center justify-center text-muted-foreground text-sm font-medium">
        Loading PCB details...
      </div>
    }>
      <PCBStructureContent />
    </React.Suspense>
  )
}
