"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Factory, Layers, Cpu, Award, Truck, Landmark,
  ShieldAlert, ShoppingBag, Nut, PlayCircle, ChevronDown,
  ChevronUp, Check, Package, Plus, ArrowLeft, ArrowRight, RotateCcw,
} from "lucide-react"
import { buildProductionData } from "@/mockdata/production"
import { useData } from "@/lib/data-provider"
import { useModules } from "@/components/module-provider"
import { DragScrollArea } from "@/components/ui/drag-scroll-area"

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
  const { isEnabled } = useModules()
  const d = useData()
  const { PLANNER_SHORTAGES: SHORTAGES } = React.useMemo(() => buildProductionData(d), [d])
  const inventoryOn = isEnabled("inventory")
  const purchasingOn = isEnabled("purchasing")
  const [product, setProduct] = React.useState("roip-400")
  const [quantity, setQuantity] = React.useState(100)
  const [targetDate, setTargetDate] = React.useState("2026-07-15")
  const [calculated, setCalculated] = React.useState(false)
  const [currentStep, setCurrentStep] = React.useState(0)
  const [toast, setToast] = React.useState<{ message: string; type: "success" | "warning" } | null>(null)

  // Expandable PCBs state for the PCB Breakdown step
  const [expandedPcb, setExpandedPcb] = React.useState<Record<string, boolean>>({
    audio: true,
    gsm: false,
  })

  const togglePcbExpand = (pcbKey: string) => {
    setExpandedPcb((prev) => ({ ...prev, [pcbKey]: !prev[pcbKey] }))
  }

  const showToast = (message: string, type: "success" | "warning" = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  const resetCalc = () => setCalculated(false)

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault()
    setCalculated(true)
    setCurrentStep(0)
    const count = inventoryOn ? SHORTAGES.length : 0
    if (count > 0) {
      showToast(`Calculation complete — ${count} component shortage${count > 1 ? "s" : ""} detected!`, "warning")
    } else {
      showToast("MRP requirements calculated successfully — no shortages!")
    }
  }

  // One PR per shortage line, sourced from the component's cheapest current offer.
  const handleCreatePR = async () => {
    const created: string[] = []
    for (const shortage of SHORTAGES) {
      const comp = d.COMPONENTS.find((c) => c.name === shortage.item)
      if (!comp) continue
      const offer = d.cheapestOffer(comp)
      if (!offer) continue
      const res = await fetch("/api/purchase-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          componentPN: comp.genericPN,
          brandSlug: offer.brandId,
          supplierSlug: offer.supplierId,
          qty: shortage.missing,
          remarks: "Generated from MRP planner shortage audit",
        }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok && body?.data) created.push(body.data.prId)
    }
    if (created.length) {
      showToast(`Purchase Request${created.length > 1 ? "s" : ""} ${created.join(" and ")} created for shortage components!`)
    } else {
      showToast("Could not create purchase requests (writes are disabled in mock mode).", "warning")
    }
  }

  const productName = product === "roip-400" ? "ROIP 400" : "Voice Logger"

  // ─── Wizard step definitions ─────────────────────────────────────────────
  const steps: { key: string; label: string; title: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "structure", label: "Structure", title: "Product Structure Allocation", desc: "Audit sub-assembly counts needed for the build target", icon: Layers },
    { key: "pcb", label: "PCB Breakdown", title: "PCB Breakdown", desc: "Component requirements by sub-assembly board", icon: Cpu },
    { key: "brand", label: "Brand Alloc.", title: "Brand Allocation", desc: "Allocate raw stock across approved brands", icon: Award },
    { key: "supplier", label: "Suppliers", title: "Supplier Options", desc: "Distributor channels and brand unit pricing", icon: Truck },
    { key: "matrix", label: "Matrix", title: "Raw Material Allocation Matrix", desc: "BOM component mapping to active brand stock", icon: Landmark },
    { key: "shortage", label: "Shortages", title: "Shortages Found", desc: "Automated shortage audit on the launched batch", icon: ShieldAlert },
    { key: "purchase", label: "Purchase", title: "Purchase Recommendations", desc: "Sourcing suggestions for the missing parts", icon: ShoppingBag },
    { key: "impact", label: "Impact", title: "Inventory Impact", desc: "Estimated stock levels before and after the run", icon: Nut },
  ].filter((s) => {
    // Shortage audit and stock impact are Inventory-module features;
    // purchase recommendations belong to the Purchasing module
    if ((s.key === "shortage" || s.key === "impact") && !inventoryOn) return false
    if (s.key === "purchase" && !purchasingOn) return false
    return true
  })
  const totalSteps = steps.length
  // Clamp so a live module toggle mid-wizard can't index past the shrunken step list
  const stepIndex = Math.min(currentStep, totalSteps - 1)
  const step = steps[stepIndex]
  const StepIcon = step.icon
  const isLast = stepIndex === totalSteps - 1

  const hasShortage = inventoryOn && SHORTAGES.length > 0
  const shortageStepIndex = steps.findIndex((s) => s.key === "shortage")

  // ─── Step body renderer ──────────────────────────────────────────────────
  const renderStepBody = () => {
    switch (step.key) {
      case "structure":
        return (
          <>
            <div className="flex items-center gap-1.5 bg-primary/5 border border-primary/10 p-3 rounded-lg w-fit text-sm font-semibold mb-4">
              <Package className="h-4 w-4 text-primary" />
              <span>{productName} × {quantity} Units</span>
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
                  {["Audio PCB", "GSM PCB", "Display PCB", "Power PCB"].map((pcb) => (
                    <tr key={pcb} className="hover:bg-muted/5 font-medium">
                      <td className="px-4 py-3">{pcb}</td>
                      <td className="px-4 py-3 text-center font-mono">1</td>
                      <td className="px-4 py-3 text-right font-mono text-primary font-bold">{quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )

      case "pcb":
        return (
          <div className="space-y-4">
            {/* Audio PCB */}
            <div className="border border-border rounded-xl overflow-hidden">
              <div onClick={() => togglePcbExpand("audio")} className="bg-muted/30 px-4 py-3 flex items-center justify-between cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" />
                  <span className="font-extrabold text-sm">Audio PCB Breakdown</span>
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-mono font-bold">Required Qty: {quantity}</span>
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
                      {[["Resistor 10K", 20], ["Capacitor 100uF", 10], ["Audio Codec", 1]].map(([c, q]) => (
                        <tr key={c as string} className="hover:bg-muted/5 font-medium">
                          <td className="px-3 py-2.5">{c}</td>
                          <td className="px-3 py-2.5 text-center font-mono">{q}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold">{((q as number) * quantity).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* GSM PCB */}
            <div className="border border-border rounded-xl overflow-hidden">
              <div onClick={() => togglePcbExpand("gsm")} className="bg-muted/30 px-4 py-3 flex items-center justify-between cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" />
                  <span className="font-extrabold text-sm">GSM PCB Breakdown</span>
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-mono font-bold">Required Qty: {quantity}</span>
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
                      {[["GSM Chip", 1], ["SIM Holder", 1], ["Capacitor 10uF", 15]].map(([c, q]) => (
                        <tr key={c as string} className="hover:bg-muted/5 font-medium">
                          <td className="px-3 py-2.5">{c}</td>
                          <td className="px-3 py-2.5 text-center font-mono">{q}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold">{((q as number) * quantity).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )

      case "brand":
        return (
          <div className="space-y-4">
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
          </div>
        )

      case "supplier":
        return (
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
                {[["ABC", "Yageo", "₹0.80"], ["XYZ", "Yageo", "₹0.82"], ["Mouser", "Vishay", "₹0.95"]].map(([s, b, p]) => (
                  <tr key={s} className="hover:bg-muted/5 font-medium">
                    <td className="px-4 py-2.5 font-semibold">{s}</td>
                    <td className="px-4 py-2.5">{b}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-primary font-bold">{p}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )

      case "matrix":
        return (
          <DragScrollArea className="overflow-x-auto border border-border rounded-lg bg-background">
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
                  <td className="px-4 py-2.5 font-bold">Audio Codec</td>
                  <td className="px-4 py-2.5 font-mono font-bold">AUD-CDC</td>
                  <td className="px-4 py-2.5 text-right font-mono">100</td>
                </tr>
              </tbody>
            </table>
          </DragScrollArea>
        )

      case "shortage":
        return hasShortage ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
              <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-bold text-destructive">{SHORTAGES.length} component shortages will block this batch</p>
                <p className="text-destructive/80 text-xs mt-0.5">
                  Production cannot proceed until the missing quantities below are procured. Continue to the Purchase step to raise requests.
                </p>
              </div>
            </div>
            <div className="border border-destructive/20 rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left text-foreground">
                <thead className="bg-destructive/10 uppercase text-xs text-destructive/80 border-b border-destructive/20 font-semibold">
                  <tr>
                    <th className="px-6 py-2.5">Component Item</th>
                    <th className="px-6 py-2.5">Shortage Brand</th>
                    <th className="px-6 py-2.5 text-right">Missing Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-destructive/10 text-destructive font-semibold">
                  {SHORTAGES.map((s) => (
                    <tr key={s.item} className="hover:bg-destructive/5 transition-colors">
                      <td className="px-6 py-3 flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                        {s.item}
                      </td>
                      <td className="px-6 py-3 font-mono">{s.brand}</td>
                      <td className="px-6 py-3 text-right font-mono font-black">-{s.missing} PCS</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
            <Check className="h-5 w-5 text-emerald-500 shrink-0" />
            <p className="font-semibold text-emerald-600 dark:text-emerald-400">No shortages — all components are fully stocked for this batch.</p>
          </div>
        )

      case "purchase":
        return (
          <div className="space-y-5">
            <div className="flex justify-end">
              <Button size="sm" className="font-bold gap-1 cursor-pointer text-xs" onClick={handleCreatePR}>
                <Plus className="h-3.5 w-3.5" />
                <span>Create Purchase Request</span>
              </Button>
            </div>
            {/* Audio Codec */}
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
                    <tr className="hover:bg-muted/5"><td className="px-4 py-2.5">Mouser</td><td className="px-4 py-2.5 font-mono text-muted-foreground">7 Days</td><td className="px-4 py-2.5 text-right font-mono text-primary font-bold">₹85</td></tr>
                    <tr className="hover:bg-muted/5"><td className="px-4 py-2.5">Arrow</td><td className="px-4 py-2.5 font-mono text-muted-foreground">5 Days</td><td className="px-4 py-2.5 text-right font-mono text-primary font-bold">₹88</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            {/* LED Green */}
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
                    <tr className="hover:bg-muted/5"><td className="px-4 py-2.5">ABC Electronics</td><td className="px-4 py-2.5 font-mono text-muted-foreground">3 Days</td><td className="px-4 py-2.5 text-right font-mono text-primary font-bold">₹2.10</td></tr>
                    <tr className="hover:bg-muted/5"><td className="px-4 py-2.5">XYZ Components</td><td className="px-4 py-2.5 font-mono text-muted-foreground">2 Days</td><td className="px-4 py-2.5 text-right font-mono text-primary font-bold">₹2.20</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )

      case "impact":
        return (
          <div className="space-y-4">
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
          </div>
        )
    }
  }

  return (
    <div className="space-y-6 relative">
      {/* Toast alert */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 max-w-sm p-4 rounded-xl shadow-lg border transition-all animate-in fade-in slide-in-from-bottom-5 duration-300 ${
          toast.type === "warning"
            ? "bg-destructive/10 border-destructive/25 text-destructive"
            : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
        }`}>
          <div className="flex items-center gap-2">
            {toast.type === "warning" ? <ShieldAlert className="h-4 w-4 text-destructive" /> : <Check className="h-4 w-4 text-emerald-500" />}
            <span className="text-sm font-semibold">{toast.message}</span>
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
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Production Planner</h1>
        <p className="text-muted-foreground">
          Simulate Material Requirements Planning (MRP) and allocate brand-specific inventory before launching shop floor orders.
        </p>
      </div>

      {/* Production Request Form */}
      <Card className="border border-border shadow-sm">
        <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
          <div className="flex items-center gap-2">
            <Factory className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg font-bold">Production Request</CardTitle>
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
                onChange={(e) => { setProduct(e.target.value); resetCalc() }}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="roip-400">ROIP 400</option>
                <option value="voice-logger">Voice Logger</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">Production Quantity</label>
              <Input type="number" min={1} value={quantity}
                onChange={(e) => { setQuantity(parseInt(e.target.value) || 0); resetCalc() }}
                className="border-input bg-background font-mono font-bold" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">Target Date</label>
              <Input type="date" value={targetDate}
                onChange={(e) => { setTargetDate(e.target.value); resetCalc() }}
                className="border-input bg-background font-mono font-bold" />
            </div>
            <Button type="submit" className="font-bold gap-2 cursor-pointer w-full">
              <PlayCircle className="h-4.5 w-4.5" />
              <span>Calculate</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Wizard */}
      {calculated && (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-400">
          {/* Shortage alert banner */}
          {hasShortage && (
            <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 sm:flex-row sm:items-center sm:justify-between animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-start gap-3">
                <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
                  <ShieldAlert className="h-5 w-5" />
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {SHORTAGES.length}
                  </span>
                </span>
                <div>
                  <p className="text-sm font-bold text-destructive">
                    Material shortage detected — production will be blocked
                  </p>
                  <p className="text-xs text-destructive/80 mt-0.5">
                    {SHORTAGES.map((s) => `${s.item} (−${s.missing})`).join(", ")} short for this batch run.
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="font-bold gap-1.5 cursor-pointer shrink-0"
                onClick={() => setCurrentStep(shortageStepIndex)}
              >
                Review Shortages
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* Run summary + stepper */}
          <Card className="border border-border shadow-sm">
            <CardContent className="p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/5 border border-primary/15 px-3 py-1 font-semibold">
                    <Package className="h-4 w-4 text-primary" />
                    {productName} × {quantity}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1 font-medium text-muted-foreground font-mono">
                    Target {targetDate}
                  </span>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 font-semibold cursor-pointer" onClick={resetCalc}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Recalculate
                </Button>
              </div>

              {/* Stepper */}
              <div className="overflow-x-auto">
                <div className="flex min-w-max items-center">
                  {steps.map((s, idx) => {
                    const SIcon = s.icon
                    const done = idx < stepIndex
                    const active = idx === stepIndex
                    const flagged = s.key === "shortage" && hasShortage
                    return (
                      <React.Fragment key={s.key}>
                        <button
                          onClick={() => setCurrentStep(idx)}
                          className="flex flex-col items-center gap-1.5 px-1 cursor-pointer group"
                        >
                          <span className={`relative flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                            active
                              ? flagged
                                ? "border-destructive bg-destructive text-destructive-foreground"
                                : "border-primary bg-primary text-primary-foreground"
                              : flagged
                              ? "border-destructive/50 bg-destructive/10 text-destructive ring-2 ring-destructive/15"
                              : done
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border bg-background text-muted-foreground group-hover:border-primary/40"
                          }`}>
                            {done && !flagged ? <Check className="h-4 w-4" /> : <SIcon className="h-4 w-4" />}
                            {flagged && (
                              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                                {SHORTAGES.length}
                              </span>
                            )}
                          </span>
                          <span className={`text-[10px] font-semibold whitespace-nowrap ${
                            flagged ? "text-destructive" : active ? "text-foreground" : "text-muted-foreground"
                          }`}>
                            {s.label}
                          </span>
                        </button>
                        {idx < totalSteps - 1 && (
                          <div className={`h-0.5 w-8 sm:w-12 mb-5 rounded-full transition-colors ${idx < stepIndex ? "bg-primary/40" : "bg-border"}`} />
                        )}
                      </React.Fragment>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Current step card */}
          <Card key={step.key} className="border border-border shadow-sm animate-in fade-in slide-in-from-right-4 duration-300">
            <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
              <div className="flex items-center gap-2">
                <StepIcon className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    {step.title}
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      Step {stepIndex + 1} / {totalSteps}
                    </span>
                  </CardTitle>
                  <CardDescription>{step.desc}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">{renderStepBody()}</CardContent>
          </Card>

          {/* Navigation footer */}
          <div className="flex items-center justify-between gap-4">
            <Button
              variant="outline"
              className="gap-2 font-semibold cursor-pointer"
              disabled={stepIndex === 0}
              onClick={() => setCurrentStep(Math.max(0, stepIndex - 1))}
            >
              <ArrowLeft className="h-4 w-4" />
              Previous
            </Button>

            <span className="text-xs font-semibold text-muted-foreground font-mono">
              Step {stepIndex + 1} of {totalSteps}
            </span>

            {isLast ? (
              <Button
                className="gap-2 font-semibold cursor-pointer"
                onClick={() => showToast("Production plan reviewed and ready to launch!")}
              >
                <Check className="h-4 w-4" />
                Finish Plan
              </Button>
            ) : (
              <Button
                className="gap-2 font-semibold cursor-pointer"
                onClick={() => setCurrentStep(Math.min(totalSteps - 1, stepIndex + 1))}
              >
                Next Step
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
