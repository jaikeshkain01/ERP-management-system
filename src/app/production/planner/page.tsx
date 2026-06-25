"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  Factory, Layers, Cpu, Award, Truck, Landmark, 
  ShieldAlert, ShoppingBag, Nut, PlayCircle, ChevronDown, 
  ChevronUp, Check, AlertCircle, CalendarDays, Clock, Package, Plus
} from "lucide-react"

// Types
interface PurchaseRequest {
  prId: string
  componentId: string
  componentName: string
  brandId: string
  brandName: string
  supplierId: string
  supplierName: string
  qty: number
  totalCost: string
  status: "Draft" | "Pending Approval" | "Sent" | "Approved"
  date: string
}

export default function ProductionPlannerPage() {
  const [product, setProduct] = React.useState("roip-400")
  const [quantity, setQuantity] = React.useState(100)
  const [targetDate, setTargetDate] = React.useState("2026-07-15")
  const [calculated, setCalculated] = React.useState(false)
  const [toast, setToast] = React.useState<string | null>(null)
  
  // Expandable PCBs state for Step 3
  const [expandedPcb, setExpandedPcb] = React.useState<Record<string, boolean>>({
    "audio": true,
    "gsm": false,
    "display": false,
    "power": false
  })

  const togglePcbExpand = (pcbKey: string) => {
    setExpandedPcb(prev => ({ ...prev, [pcbKey]: !prev[pcbKey] }))
  }

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault()
    setCalculated(true)
    showToast("MRP requirements and brand allocations calculated successfully!")
  }

  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 3000)
  }

  const handleCreatePR = () => {
    // Generate PRs for the two shortages: Audio Codec (TI, missing 50) and LED Green (Panasonic, missing 200)
    const today = new Date().toISOString().split("T")[0]
    
    const pr1: PurchaseRequest = {
      prId: `PR-${Math.floor(100000 + Math.random() * 900000)}`,
      componentId: "audio-codec",
      componentName: "Audio Codec",
      brandId: "ti",
      brandName: "TI",
      supplierId: "mouser",
      supplierName: "Mouser",
      qty: 50,
      totalCost: "₹4,250.00", // 50 * 85
      status: "Pending Approval",
      date: today
    }

    const pr2: PurchaseRequest = {
      prId: `PR-${Math.floor(100000 + Math.random() * 900000)}`,
      componentId: "led-green",
      componentName: "LED Green",
      brandId: "panasonic",
      brandName: "Panasonic",
      supplierId: "abc-electronics",
      supplierName: "ABC Electronics",
      qty: 200,
      totalCost: "₹420.00", // 200 * 2.10
      status: "Pending Approval",
      date: today
    }

    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mockup2_erp_purchase_requests")
      const currentList = saved ? JSON.parse(saved) : []
      localStorage.setItem("mockup2_erp_purchase_requests", JSON.stringify([pr1, pr2, ...currentList]))
    }

    showToast(`Purchase Requests ${pr1.prId} and ${pr2.prId} created for shortage components!`)
  }

  return (
    <div className="space-y-8 relative">
      {/* Toast alert */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 p-4 rounded-xl shadow-lg transition-all animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-semibold">{toast}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <span>Production</span>
          <span>/</span>
          <span className="text-foreground font-medium">Production Planner</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Production Planner</h1>
        <p className="text-muted-foreground">
          Simulate Material Requirements Planning (MRP) and allocate brand-specific inventory before launching shop floor orders.
        </p>
      </div>

      {/* Step 1: Production Request Form Card */}
      <Card className="border border-border shadow-sm">
        <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
          <div className="flex items-center gap-2">
            <Factory className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg font-bold">Step 1 — Production Request</CardTitle>
              <CardDescription>Configure target product and quantities for batch run simulation</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleCalculate} className="grid gap-4 md:grid-cols-4 items-end">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">Product</label>
              <select 
                value={product}
                onChange={(e) => {
                  setProduct(e.target.value)
                  setCalculated(false)
                }}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="roip-400">ROIP 400</option>
                <option value="voice-logger">Voice Logger</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">Production Quantity</label>
              <Input 
                type="number" 
                min={1} 
                value={quantity}
                onChange={(e) => {
                  setQuantity(parseInt(e.target.value) || 0)
                  setCalculated(false)
                }}
                className="border-input bg-background font-mono font-bold"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">Target Date</label>
              <Input 
                type="date"
                value={targetDate}
                onChange={(e) => {
                  setTargetDate(e.target.value)
                  setCalculated(false)
                }}
                className="border-input bg-background font-mono font-bold"
              />
            </div>

            <Button type="submit" className="font-bold gap-2 cursor-pointer w-full">
              <PlayCircle className="h-4.5 w-4.5" />
              <span>Calculate</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Calculated Steps 2 to 9 */}
      {calculated && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-500">
          
          <div className="grid gap-6 lg:grid-cols-2">
            
            {/* Left Side: Product Allocations (Step 2, 3, 4, 5) */}
            <div className="space-y-6">
              
              {/* Step 2: Product Structure Allocation */}
              <Card className="border border-border shadow-sm">
                <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-lg font-bold">Step 2 — Product Structure Allocation</CardTitle>
                      <CardDescription>Audit sub-assembly counts needed for build target</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="flex items-center gap-1.5 bg-primary/5 border border-primary/10 p-3 rounded-lg w-fit text-sm font-semibold mb-4">
                    <Package className="h-4 w-4 text-primary" />
                    <span>{product === "roip-400" ? "ROIP 400" : "Voice Logger"} × {quantity} Units</span>
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden bg-background">
                    <table className="w-full text-sm text-left text-foreground">
                      <thead className="bg-muted uppercase text-xs text-muted-foreground border-b border-border font-semibold">
                        <tr>
                          <th className="px-4 py-2.5">PCB Sub-Assembly</th>
                          <th className="px-4 py-2.5 text-center">Qty / Product</th>
                          <th className="px-4 py-2.5 text-right">Required Batch Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        <tr className="hover:bg-muted/5 font-medium">
                          <td className="px-4 py-3">Audio PCB</td>
                          <td className="px-4 py-3 text-center font-mono">1</td>
                          <td className="px-4 py-3 text-right font-mono text-primary font-bold">100</td>
                        </tr>
                        <tr className="hover:bg-muted/5 font-medium">
                          <td className="px-4 py-3">GSM PCB</td>
                          <td className="px-4 py-3 text-center font-mono">1</td>
                          <td className="px-4 py-3 text-right font-mono text-primary font-bold">100</td>
                        </tr>
                        <tr className="hover:bg-muted/5 font-medium">
                          <td className="px-4 py-3">Display PCB</td>
                          <td className="px-4 py-3 text-center font-mono">1</td>
                          <td className="px-4 py-3 text-right font-mono text-primary font-bold">100</td>
                        </tr>
                        <tr className="hover:bg-muted/5 font-medium">
                          <td className="px-4 py-3">Power PCB</td>
                          <td className="px-4 py-3 text-center font-mono">1</td>
                          <td className="px-4 py-3 text-right font-mono text-primary font-bold">100</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Step 3: PCB Breakdown (Expandable Cards) */}
              <Card className="border border-border shadow-sm">
                <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-lg font-bold">Step 3 — PCB Breakdown</CardTitle>
                      <CardDescription>Inspect component breakdown requirements by sub-assembly board</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  
                  {/* Expandable: Audio PCB */}
                  <div className="border border-border rounded-xl overflow-hidden">
                    <div 
                      onClick={() => togglePcbExpand("audio")}
                      className="bg-muted/30 px-4 py-3 flex items-center justify-between cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-primary" />
                        <span className="font-extrabold text-sm">Audio PCB Breakdown</span>
                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-mono font-bold">Required Qty: 100</span>
                      </div>
                      {expandedPcb["audio"] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                    {expandedPcb["audio"] && (
                      <div className="p-4 border-t border-border bg-background animate-in slide-in-from-top-2 duration-200">
                        <table className="w-full text-xs text-left text-foreground">
                          <thead className="bg-muted/40 uppercase text-[10px] text-muted-foreground border-b border-border font-semibold">
                            <tr>
                              <th className="px-3 py-2">Component</th>
                              <th className="px-3 py-2 text-center">Qty / PCB</th>
                              <th className="px-3 py-2 text-right">Required Qty</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            <tr className="hover:bg-muted/5 font-medium">
                              <td className="px-3 py-2.5">Resistor 10K</td>
                              <td className="px-3 py-2.5 text-center font-mono">20</td>
                              <td className="px-3 py-2.5 text-right font-mono font-bold">2,000</td>
                            </tr>
                            <tr className="hover:bg-muted/5 font-medium">
                              <td className="px-3 py-2.5">Capacitor 100uF</td>
                              <td className="px-3 py-2.5 text-center font-mono">10</td>
                              <td className="px-3 py-2.5 text-right font-mono font-bold">1,000</td>
                            </tr>
                            <tr className="hover:bg-muted/5 font-medium">
                              <td className="px-3 py-2.5">Audio Codec</td>
                              <td className="px-3 py-2.5 text-center font-mono">1</td>
                              <td className="px-3 py-2.5 text-right font-mono font-bold">100</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Expandable: GSM PCB */}
                  <div className="border border-border rounded-xl overflow-hidden">
                    <div 
                      onClick={() => togglePcbExpand("gsm")}
                      className="bg-muted/30 px-4 py-3 flex items-center justify-between cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-primary" />
                        <span className="font-extrabold text-sm">GSM PCB Breakdown</span>
                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-mono font-bold">Required Qty: 100</span>
                      </div>
                      {expandedPcb["gsm"] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                    {expandedPcb["gsm"] && (
                      <div className="p-4 border-t border-border bg-background animate-in slide-in-from-top-2 duration-200">
                        <table className="w-full text-xs text-left text-foreground">
                          <thead className="bg-muted/40 uppercase text-[10px] text-muted-foreground border-b border-border font-semibold">
                            <tr>
                              <th className="px-3 py-2">Component</th>
                              <th className="px-3 py-2 text-center">Qty / PCB</th>
                              <th className="px-3 py-2 text-right">Required Qty</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            <tr className="hover:bg-muted/5 font-medium">
                              <td className="px-3 py-2.5">GSM Chip</td>
                              <td className="px-3 py-2.5 text-center font-mono">1</td>
                              <td className="px-3 py-2.5 text-right font-mono font-bold">100</td>
                            </tr>
                            <tr className="hover:bg-muted/5 font-medium">
                              <td className="px-3 py-2.5">SIM Holder</td>
                              <td className="px-3 py-2.5 text-center font-mono">1</td>
                              <td className="px-3 py-2.5 text-right font-mono font-bold">100</td>
                            </tr>
                            <tr className="hover:bg-muted/5 font-medium">
                              <td className="px-3 py-2.5">Capacitor 10uF</td>
                              <td className="px-3 py-2.5 text-center font-mono">15</td>
                              <td className="px-3 py-2.5 text-right font-mono font-bold">1,500</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                </CardContent>
              </Card>

              {/* Step 4: Brand Allocation */}
              <Card className="border border-border shadow-sm">
                <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Award className="h-5 w-5 text-primary" />
                      <div>
                        <CardTitle className="text-lg font-bold">Brand Allocation</CardTitle>
                        <CardDescription>Allocate raw stock across approved brands</CardDescription>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                      <Check className="h-3.5 w-3.5" />
                      Allocated Successfully
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-secondary/50 border border-border/80 p-3 rounded-lg text-sm gap-2">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">Allocation Target Item</span>
                      <span className="font-extrabold text-foreground mt-0.5 block">Resistor</span>
                    </div>
                    <div className="text-right sm:text-left">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">Total Batch Required</span>
                      <span className="font-mono font-black text-primary text-base mt-0.5 block">2,000 Units</span>
                    </div>
                  </div>

                  <div className="border border-border rounded-lg overflow-hidden bg-background">
                    <table className="w-full text-sm text-left text-foreground">
                      <thead className="bg-muted uppercase text-xs text-muted-foreground border-b border-border font-semibold">
                        <tr>
                          <th className="px-4 py-2">Brand</th>
                          <th className="px-4 py-2">Available</th>
                          <th className="px-4 py-2 text-right">Allocated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        <tr className="hover:bg-muted/5 font-semibold">
                          <td className="px-4 py-2.5">Yageo</td>
                          <td className="px-4 py-2.5 font-mono text-muted-foreground">1,200</td>
                          <td className="px-4 py-2.5 text-right font-mono text-emerald-600 font-black">1,200</td>
                        </tr>
                        <tr className="hover:bg-muted/5 font-semibold">
                          <td className="px-4 py-2.5">Vishay</td>
                          <td className="px-4 py-2.5 font-mono text-muted-foreground">1,000</td>
                          <td className="px-4 py-2.5 text-right font-mono text-emerald-600 font-black">800</td>
                        </tr>
                        <tr className="hover:bg-muted/5 text-muted-foreground/60">
                          <td className="px-4 py-2.5 font-semibold">Panasonic</td>
                          <td className="px-4 py-2.5 font-mono">500</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold">0</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Step 5: Supplier Visibility */}
              <Card className="border border-border shadow-sm">
                <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Truck className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-lg font-bold">Supplier Options</CardTitle>
                      <CardDescription>Available distributor channels and brand unit pricing</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="border border-border rounded-lg overflow-hidden bg-background">
                    <table className="w-full text-sm text-left text-foreground">
                      <thead className="bg-muted uppercase text-xs text-muted-foreground border-b border-border font-semibold">
                        <tr>
                          <th className="px-4 py-2">Supplier</th>
                          <th className="px-4 py-2">Brand</th>
                          <th className="px-4 py-2 text-right">Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        <tr className="hover:bg-muted/5 font-medium">
                          <td className="px-4 py-2.5 font-semibold">ABC</td>
                          <td className="px-4 py-2.5">Yageo</td>
                          <td className="px-4 py-2.5 text-right font-mono text-primary font-bold">₹0.80</td>
                        </tr>
                        <tr className="hover:bg-muted/5 font-medium">
                          <td className="px-4 py-2.5 font-semibold">XYZ</td>
                          <td className="px-4 py-2.5">Yageo</td>
                          <td className="px-4 py-2.5 text-right font-mono text-primary font-bold">₹0.82</td>
                        </tr>
                        <tr className="hover:bg-muted/5 font-medium">
                          <td className="px-4 py-2.5 font-semibold">Mouser</td>
                          <td className="px-4 py-2.5">Vishay</td>
                          <td className="px-4 py-2.5 text-right font-mono text-primary font-bold">₹0.95</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

            </div>

            {/* Right Side: Matrix, Gaps, Recommendations & Impact (Step 6, 7, 8, 9) */}
            <div className="space-y-6">
              
              {/* Step 6: Raw Material Allocation Matrix */}
              <Card className="border border-border shadow-sm overflow-hidden">
                <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Landmark className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-lg font-bold">Step 6 — Raw Material Allocation Matrix</CardTitle>
                      <CardDescription>BOM component mapping to active brand stock</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left text-foreground">
                      <thead className="bg-muted/40 uppercase text-[10px] text-muted-foreground border-b border-border font-semibold">
                        <tr>
                          <th className="px-4 py-2">PCB</th>
                          <th className="px-4 py-2">Component</th>
                          <th className="px-4 py-2">Generic PN</th>
                          <th className="px-4 py-2 text-right">Required</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border font-medium">
                        <tr className="hover:bg-muted/5">
                          <td className="px-4 py-2.5 font-semibold text-muted-foreground">Audio PCB</td>
                          <td className="px-4 py-2.5 font-bold">Resistor</td>
                          <td className="px-4 py-2.5 font-mono text-primary font-bold">RES-10K</td>
                          <td className="px-4 py-2.5 text-right font-mono">2000</td>
                        </tr>
                        <tr className="hover:bg-muted/5">
                          <td className="px-4 py-2.5 font-semibold text-muted-foreground">Audio PCB</td>
                          <td className="px-4 py-2.5 font-bold">Capacitor</td>
                          <td className="px-4 py-2.5 font-mono text-primary font-bold">CAP-100UF</td>
                          <td className="px-4 py-2.5 text-right font-mono">1000</td>
                        </tr>
                        <tr className="hover:bg-muted/5 text-destructive bg-destructive/5">
                          <td className="px-4 py-2.5 font-semibold text-muted-foreground/60">Audio PCB</td>
                          <td className="px-4 py-2.5 font-bold animate-pulse">Audio Codec</td>
                          <td className="px-4 py-2.5 font-mono font-bold">AUD-CDC</td>
                          <td className="px-4 py-2.5 text-right font-mono">100</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Step 7: Shortage Analysis */}
              <Card className="border border-destructive/30 bg-destructive/5 dark:bg-red-950/10 shadow-sm overflow-hidden">
                <CardHeader className="border-b border-destructive/10 bg-destructive/10 px-6 py-4">
                  <div className="flex items-center gap-2 text-destructive">
                    <ShieldAlert className="h-5 w-5" />
                    <div>
                      <CardTitle className="text-lg font-bold">Step 7 — Shortages Found</CardTitle>
                      <CardDescription className="text-destructive/85 mt-0.5">Automated shortage audit reports on launched batch</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm text-left text-foreground">
                    <thead className="bg-destructive/10 uppercase text-xs text-destructive/80 border-b border-destructive/20 font-semibold">
                      <tr>
                        <th className="px-6 py-2.5">Component Item</th>
                        <th className="px-6 py-2.5">Shortage Brand</th>
                        <th className="px-6 py-2.5 text-right">Missing Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-destructive/10 text-destructive font-semibold">
                      <tr className="hover:bg-destructive/5 transition-colors">
                        <td className="px-6 py-3">Audio Codec</td>
                        <td className="px-6 py-3 font-mono">TI</td>
                        <td className="px-6 py-3 text-right font-mono font-black">-50 PCS</td>
                      </tr>
                      <tr className="hover:bg-destructive/5 transition-colors">
                        <td className="px-6 py-3">LED Green</td>
                        <td className="px-6 py-3 font-mono">Panasonic</td>
                        <td className="px-6 py-3 text-right font-mono font-black">-200 PCS</td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {/* Step 8: Purchase Recommendations */}
              <Card className="border border-border shadow-sm">
                <CardHeader className="border-b border-border bg-muted/20 px-6 py-4 flex flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-lg font-bold">Step 8 — Purchase Recommendations</CardTitle>
                      <CardDescription>Instant sourcing suggestions for calculated missing parts</CardDescription>
                    </div>
                  </div>
                  <Button 
                    size="sm"
                    className="font-bold gap-1 cursor-pointer text-xs"
                    onClick={handleCreatePR}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Create Purchase Request</span>
                  </Button>
                </CardHeader>
                <CardContent className="p-6 space-y-5">
                  {/* Item 1: Audio Codec */}
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-foreground bg-muted/50 px-2 py-1 rounded w-fit uppercase tracking-wide">
                      Item Shortage: Audio Codec (Brand: TI)
                    </div>
                    <div className="border border-border rounded-lg overflow-hidden bg-background text-xs">
                      <table className="w-full text-left text-foreground">
                        <thead className="bg-muted uppercase text-[10px] text-muted-foreground border-b border-border font-semibold">
                          <tr>
                            <th className="px-4 py-2">Supplier</th>
                            <th className="px-4 py-2">Lead Time</th>
                            <th className="px-4 py-2 text-right">Price</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border font-medium">
                          <tr className="hover:bg-muted/5">
                            <td className="px-4 py-2.5">Mouser</td>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground">7 Days</td>
                            <td className="px-4 py-2.5 text-right font-mono text-primary font-bold">₹85</td>
                          </tr>
                          <tr className="hover:bg-muted/5">
                            <td className="px-4 py-2.5">Arrow</td>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground">5 Days</td>
                            <td className="px-4 py-2.5 text-right font-mono text-primary font-bold">₹88</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Item 2: LED Green */}
                  <div className="space-y-2 border-t border-border/50 pt-4">
                    <div className="text-xs font-bold text-foreground bg-muted/50 px-2 py-1 rounded w-fit uppercase tracking-wide">
                      Item Shortage: LED Green (Brand: Panasonic)
                    </div>
                    <div className="border border-border rounded-lg overflow-hidden bg-background text-xs">
                      <table className="w-full text-left text-foreground">
                        <thead className="bg-muted uppercase text-[10px] text-muted-foreground border-b border-border font-semibold">
                          <tr>
                            <th className="px-4 py-2">Supplier</th>
                            <th className="px-4 py-2">Lead Time</th>
                            <th className="px-4 py-2 text-right">Price</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border font-medium">
                          <tr className="hover:bg-muted/5">
                            <td className="px-4 py-2.5">ABC Electronics</td>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground">3 Days</td>
                            <td className="px-4 py-2.5 text-right font-mono text-primary font-bold">₹2.10</td>
                          </tr>
                          <tr className="hover:bg-muted/5">
                            <td className="px-4 py-2.5">XYZ Components</td>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground">2 Days</td>
                            <td className="px-4 py-2.5 text-right font-mono text-primary font-bold">₹2.20</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                </CardContent>
              </Card>

              {/* Step 9: Inventory Impact */}
              <Card className="border border-border shadow-sm">
                <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Nut className="h-5 w-5 text-primary" />
                    <div>
                      <CardTitle className="text-lg font-bold">Inventory Impact</CardTitle>
                      <CardDescription>Estimated stock levels before and after simulated batch run execution</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-secondary/50 border border-border/80 p-3 rounded-lg text-sm gap-2">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">Impact Item</span>
                      <span className="font-extrabold text-foreground mt-0.5 block">Resistor</span>
                    </div>
                  </div>
                  
                  <div className="border border-border rounded-lg overflow-hidden bg-background">
                    <table className="w-full text-sm text-left text-foreground">
                      <thead className="bg-muted uppercase text-xs text-muted-foreground border-b border-border font-semibold">
                        <tr>
                          <th className="px-4 py-2">Brand</th>
                          <th className="px-4 py-2">Before</th>
                          <th className="px-4 py-2 text-right">After</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border font-semibold">
                        <tr className="hover:bg-muted/5">
                          <td className="px-4 py-2.5">Yageo</td>
                          <td className="px-4 py-2.5 font-mono text-muted-foreground">1,200</td>
                          <td className="px-4 py-2.5 text-right font-mono text-destructive font-black">0</td>
                        </tr>
                        <tr className="hover:bg-muted/5">
                          <td className="px-4 py-2.5">Vishay</td>
                          <td className="px-4 py-2.5 font-mono text-muted-foreground">1,000</td>
                          <td className="px-4 py-2.5 text-right font-mono text-emerald-600 font-black">200</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

            </div>

          </div>
          
        </div>
      )}
    </div>
  )
}
