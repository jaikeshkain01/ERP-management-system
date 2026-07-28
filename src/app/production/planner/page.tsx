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
import type { ReadinessView } from "@/lib/server/data/production"
import { useData } from "@/lib/data-provider"
import { useModules } from "@/components/module-provider"
import { DragScrollArea } from "@/components/ui/drag-scroll-area"

// Types
interface PlannerShortage {
  item: string
  genericPN: string
  brand: string
  missing: number
}

export default function ProductionPlannerPage() {
  const { isEnabled } = useModules()
  const d = useData()
  const inventoryOn = isEnabled("inventory")
  const purchasingOn = isEnabled("purchasing")
  const [SHORTAGES, setShortages] = React.useState<PlannerShortage[]>([])
  const [product, setProduct] = React.useState("roip-400")
  const [quantity, setQuantity] = React.useState(100)

  // Default the product selector to a real seeded product.
  React.useEffect(() => {
    if (d.PRODUCTS.length && !d.PRODUCTS.some((p) => p.id === product)) setProduct(d.PRODUCTS[0].id)
  }, [d.PRODUCTS, product])
  const [targetDate, setTargetDate] = React.useState("2026-07-15")
  const [calculated, setCalculated] = React.useState(false)
  const [currentStep, setCurrentStep] = React.useState(0)
  const [toast, setToast] = React.useState<{ message: string; type: "success" | "warning" } | null>(null)

  // Expandable PCBs state for the PCB Breakdown step
  const [expandedPcb, setExpandedPcb] = React.useState<Record<string, boolean>>({})

  const togglePcbExpand = (pcbKey: string) => {
    setExpandedPcb((prev) => ({ ...prev, [pcbKey]: prev[pcbKey] === undefined ? false : !prev[pcbKey] }))
  }

  const showToast = (message: string, type: "success" | "warning" = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  const resetCalc = () => setCalculated(false)

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault()
    const selProduct = d.getProduct(product)
    if (!selProduct) return

    let list: PlannerShortage[] = []
    
    // First try the backend readiness API if inventory module is enabled
    if (inventoryOn) {
      try {
        const params = new URLSearchParams({ product, qty: String(quantity || 1) })
        const res = await fetch(`/api/production/readiness?${params}`, { cache: "no-store" })
        const body = await res.json().catch(() => null)
        if (res.ok && body?.data) {
          list = (body.data as ReadinessView).items
            .filter((i) => !i.status)
            .map((i) => {
              const comp = d.COMPONENTS.find((c) => c.genericPN === i.genericPN)
              const brand = comp && comp.brandVariants[0] ? d.getBrandName(comp.brandVariants[0].brandId) : "—"
              return { item: i.component, genericPN: i.genericPN, brand, missing: Math.ceil(i.required - i.available) }
            })
        }
      } catch {
        /* fallback to client calculation below */
      }
    }

    // Fallback or local calculation based on catalog stock
    if (list.length === 0 && selProduct) {
      const bom = d.productBom(selProduct)
      const compReqMap = new Map<string, { comp: ReturnType<typeof d.getComponent>; required: number }>()
      for (const line of bom) {
        const existing = compReqMap.get(line.component.genericPN)
        const req = line.qty * (quantity || 1)
        if (existing) {
          existing.required += req
        } else {
          compReqMap.set(line.component.genericPN, { comp: line.component, required: req })
        }
      }

      for (const [genericPN, item] of compReqMap.entries()) {
        const available = item.comp?.stock ?? 0
        if (available < item.required) {
          const missing = item.required - available
          const brand = item.comp && item.comp.brandVariants[0] ? d.getBrandName(item.comp.brandVariants[0].brandId) : "—"
          list.push({ item: item.comp?.name ?? genericPN, genericPN, brand, missing })
        }
      }
    }

    setShortages(list)
    setCalculated(true)
    setCurrentStep(0)
    if (list.length > 0) {
      showToast(`Calculation complete — ${list.length} component shortage${list.length > 1 ? "s" : ""} detected!`, "warning")
    } else {
      showToast("MRP requirements calculated successfully — no shortages!")
    }
  }

  // One PR per shortage line, sourced from the component's cheapest current offer.
  const handleCreatePR = async () => {
    const created: string[] = []
    for (const shortage of SHORTAGES) {
      const comp = d.COMPONENTS.find((c) => c.genericPN === shortage.genericPN || c.name === shortage.item)
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
      showToast("Could not create purchase requests.", "warning")
    }
  }

  const selProduct = d.getProduct(product)
  const productName = selProduct?.name ?? "—"
  const productPcbList = selProduct ? d.productPcbList(selProduct) : []
  const productBom = selProduct ? d.productBom(selProduct) : []
  const uniqueComps = selProduct ? d.productUniqueComponents(selProduct) : []

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
    if ((s.key === "shortage" || s.key === "impact") && !inventoryOn) return false
    if (s.key === "purchase" && !purchasingOn) return false
    return true
  })

  const totalSteps = steps.length
  const stepIndex = Math.min(currentStep, totalSteps - 1)
  const step = steps[stepIndex]
  const StepIcon = step.icon
  const isLast = stepIndex === totalSteps - 1

  const hasShortage = inventoryOn && SHORTAGES.length > 0
  const shortageStepIndex = steps.findIndex((s) => s.key === "shortage")

  // ─── Step body renderer using REAL derived data ──────────────────────────
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
                    <th className="px-4 py-2.5">Code / Rev</th>
                    <th className="px-4 py-2.5 text-center">Qty / Product</th>
                    <th className="px-4 py-2.5 text-right">Required Batch Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {productPcbList.map((entry) => (
                    <tr key={entry.pcb.id} className="hover:bg-muted/5 font-medium">
                      <td className="px-4 py-3 font-semibold">{entry.pcb.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{entry.pcb.id}</td>
                      <td className="px-4 py-3 text-center font-mono">{entry.qty}</td>
                      <td className="px-4 py-3 text-right font-mono text-primary font-bold">{(entry.qty * quantity).toLocaleString()}</td>
                    </tr>
                  ))}
                  {productPcbList.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-xs">
                        No PCB sub-assemblies associated with this product.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )

      case "pcb":
        return (
          <div className="space-y-4">
            {productPcbList.map((entry) => {
              const pcbKey = entry.pcb.id
              const isExpanded = expandedPcb[pcbKey] ?? true
              const bomLines = d.pcbBom(entry.pcb)
              return (
                <div key={pcbKey} className="border border-border rounded-xl overflow-hidden">
                  <div
                    onClick={() => togglePcbExpand(pcbKey)}
                    className="bg-muted/30 px-4 py-3 flex items-center justify-between cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-primary" />
                      <span className="font-extrabold text-sm">{entry.pcb.name} Breakdown</span>
                      <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-mono font-bold">
                        Required Board Qty: {(entry.qty * quantity).toLocaleString()}
                      </span>
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                  {isExpanded && (
                    <div className="p-4 border-t border-border bg-background animate-in slide-in-from-top-2 duration-200">
                      <table className="w-full text-xs text-left text-foreground">
                        <thead className="bg-muted/40 uppercase text-[10px] text-muted-foreground border-b border-border font-semibold">
                          <tr>
                            <th className="px-3 py-2">Component</th>
                            <th className="px-3 py-2 text-center">Qty / PCB</th>
                            <th className="px-3 py-2 text-right">Required Batch Qty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {bomLines.map((line) => (
                            <tr key={line.component.id} className="hover:bg-muted/5 font-medium">
                              <td className="px-3 py-2.5">
                                <span className="font-semibold block">{line.component.name}</span>
                                <span className="text-muted-foreground font-mono text-[10px]">{line.component.genericPN}</span>
                              </td>
                              <td className="px-3 py-2.5 text-center font-mono">{line.qty}</td>
                              <td className="px-3 py-2.5 text-right font-mono font-bold">
                                {(line.qty * entry.qty * quantity).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                          {bomLines.length === 0 && (
                            <tr>
                              <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground text-xs">
                                No components defined in PCB BOM.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )

      case "brand":
        return (
          <div className="space-y-6">
            {uniqueComps.map((comp) => {
              const compReq = productBom
                .filter((l) => l.component.id === comp.id)
                .reduce((s, l) => s + l.qty * quantity, 0)
              let remainingAlloc = compReq

              return (
                <div key={comp.id} className="space-y-3 border border-border/80 rounded-xl p-4 bg-card shadow-2xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">Component Item</span>
                      <span className="font-extrabold text-foreground text-sm">{comp.name} ({comp.genericPN})</span>
                    </div>
                    <div className="text-right sm:text-left">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">Batch Requirement</span>
                      <span className="font-mono font-black text-primary text-sm">{compReq.toLocaleString()} {comp.unit}</span>
                    </div>
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden bg-background">
                    <table className="w-full text-xs text-left text-foreground">
                      <thead className="bg-muted uppercase text-[10px] text-muted-foreground border-b border-border font-semibold">
                        <tr>
                          <th className="px-4 py-2">Brand / Manufacturer</th>
                          <th className="px-4 py-2">Part No.</th>
                          <th className="px-4 py-2 text-right">Available Stock</th>
                          <th className="px-4 py-2 text-right">Allocated Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {comp.brandVariants.map((v) => {
                          const brandName = d.getBrandName(v.brandId)
                          const alloc = Math.min(v.stock, remainingAlloc)
                          remainingAlloc = Math.max(0, remainingAlloc - alloc)
                          return (
                            <tr key={v.brandId + v.partNo} className="hover:bg-muted/5 font-semibold">
                              <td className="px-4 py-2.5">{brandName}</td>
                              <td className="px-4 py-2.5 font-mono text-muted-foreground">{v.partNo}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{v.stock.toLocaleString()}</td>
                              <td className={`px-4 py-2.5 text-right font-mono font-black ${alloc > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                                {alloc.toLocaleString()}
                              </td>
                            </tr>
                          )
                        })}
                        {comp.brandVariants.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-4 py-3 text-center text-muted-foreground">No brand variants registered.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )

      case "supplier":
        return (
          <div className="space-y-6">
            {uniqueComps.map((comp) => (
              <div key={comp.id} className="space-y-2 border border-border/80 rounded-xl p-4 bg-card">
                <div className="text-xs font-bold text-foreground bg-muted/50 px-3 py-1.5 rounded-lg w-fit">
                  {comp.name} <span className="font-mono text-muted-foreground">({comp.genericPN})</span>
                </div>
                <div className="border border-border rounded-lg overflow-hidden bg-background">
                  <table className="w-full text-xs text-left text-foreground">
                    <thead className="bg-muted uppercase text-[10px] text-muted-foreground border-b border-border font-semibold">
                      <tr>
                        <th className="px-4 py-2">Supplier</th>
                        <th className="px-4 py-2">Brand</th>
                        <th className="px-4 py-2">Lead Time</th>
                        <th className="px-4 py-2 text-right">Unit Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {comp.offers.map((o) => (
                        <tr key={o.supplierId + o.brandId} className="hover:bg-muted/5 font-medium">
                          <td className="px-4 py-2.5 font-semibold">{d.getSupplierName(o.supplierId)}</td>
                          <td className="px-4 py-2.5">{d.getBrandName(o.brandId)}</td>
                          <td className="px-4 py-2.5 font-mono text-muted-foreground">{d.formatLeadTime(o.leadTimeDays)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-primary font-bold">{d.formatINR(o.price)}</td>
                        </tr>
                      ))}
                      {comp.offers.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-3 text-center text-muted-foreground">No active supplier offers.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )

      case "matrix":
        return (
          <DragScrollArea className="overflow-x-auto border border-border rounded-lg bg-background">
            <table className="w-full text-xs text-left text-foreground">
              <thead className="bg-muted/40 uppercase text-[10px] text-muted-foreground border-b border-border font-semibold">
                <tr>
                  <th className="px-4 py-2">PCB Sub-Assembly</th>
                  <th className="px-4 py-2">Component</th>
                  <th className="px-4 py-2">Generic PN</th>
                  <th className="px-4 py-2 text-right">Required Batch Qty</th>
                  <th className="px-4 py-2 text-right">Stock On Hand</th>
                  <th className="px-4 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-medium">
                {productBom.map((line, idx) => {
                  const req = line.qty * quantity
                  const avail = line.component.stock
                  const isOk = avail >= req
                  return (
                    <tr key={line.pcb.id + line.component.id + idx} className={`hover:bg-muted/5 ${!isOk ? "bg-destructive/5 text-destructive" : ""}`}>
                      <td className="px-4 py-2.5 font-semibold text-muted-foreground">{line.pcb.name}</td>
                      <td className="px-4 py-2.5 font-bold">{line.component.name}</td>
                      <td className="px-4 py-2.5 font-mono font-bold">{line.component.genericPN}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold">{req.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{avail.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isOk
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                            : "bg-destructive/10 text-destructive border border-destructive/20"
                        }`}>
                          {isOk ? "Fully Stocked" : `Shortage (-${(req - avail).toLocaleString()})`}
                        </span>
                      </td>
                    </tr>
                  )
                })}
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
                <p className="font-bold text-destructive">{SHORTAGES.length} component shortage{SHORTAGES.length > 1 ? "s" : ""} will block this batch</p>
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
                    <th className="px-6 py-2.5">Generic P/N</th>
                    <th className="px-6 py-2.5">Shortage Brand</th>
                    <th className="px-6 py-2.5 text-right">Missing Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-destructive/10 text-destructive font-semibold">
                  {SHORTAGES.map((s, idx) => (
                    <tr key={`${s.genericPN || s.item}-${idx}`} className="hover:bg-destructive/5 transition-colors">
                      <td className="px-6 py-3 flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                        {s.item}
                      </td>
                      <td className="px-6 py-3 font-mono text-xs">{s.genericPN}</td>
                      <td className="px-6 py-3 font-mono">{s.brand}</td>
                      <td className="px-6 py-3 text-right font-mono font-black">-{s.missing.toLocaleString()} PCS</td>
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
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-muted/20 p-3 rounded-lg border border-border">
              <span className="text-xs font-semibold text-muted-foreground">
                Recommended Purchase Requests for Shortages ({SHORTAGES.length})
              </span>
              <Button size="sm" className="font-bold gap-1 cursor-pointer text-xs" onClick={handleCreatePR} disabled={!SHORTAGES.length}>
                <Plus className="h-3.5 w-3.5" />
                <span>Create Purchase Request</span>
              </Button>
            </div>
            {SHORTAGES.map((s, idx) => {
              const comp = d.COMPONENTS.find((c) => c.genericPN === s.genericPN || c.name === s.item)
              const offers = comp?.offers ?? []
              return (
                <div key={`${s.genericPN || s.item}-${idx}`} className="space-y-2 border border-border/80 rounded-xl p-4 bg-card">
                  <div className="text-xs font-bold text-foreground bg-destructive/10 text-destructive border border-destructive/20 px-2.5 py-1 rounded-md w-fit uppercase tracking-wide">
                    Item Shortage: {s.item} ({s.genericPN}) — Missing: {s.missing.toLocaleString()} PCS
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden bg-background text-xs">
                    <table className="w-full text-left text-foreground">
                      <thead className="bg-muted uppercase text-[10px] text-muted-foreground border-b border-border font-semibold">
                        <tr>
                          <th className="px-4 py-2">Supplier</th>
                          <th className="px-4 py-2">Brand</th>
                          <th className="px-4 py-2">Lead Time</th>
                          <th className="px-4 py-2 text-right">Unit Price</th>
                          <th className="px-4 py-2 text-right">Total Est. Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border font-medium">
                        {offers.map((o) => (
                          <tr key={o.supplierId + o.brandId} className="hover:bg-muted/5">
                            <td className="px-4 py-2.5 font-semibold">{d.getSupplierName(o.supplierId)}</td>
                            <td className="px-4 py-2.5">{d.getBrandName(o.brandId)}</td>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground">{d.formatLeadTime(o.leadTimeDays)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-primary font-bold">{d.formatINR(o.price)}</td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold">{d.formatINR(o.price * s.missing)}</td>
                          </tr>
                        ))}
                        {offers.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-4 py-3 text-center text-muted-foreground">No active supplier offers for this component.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
            {SHORTAGES.length === 0 && (
              <div className="text-center py-8 text-xs text-muted-foreground">
                No component shortages — no purchase requests required.
              </div>
            )}
          </div>
        )

      case "impact":
        return (
          <div className="space-y-6">
            {uniqueComps.map((comp) => {
              const req = productBom
                .filter((l) => l.component.id === comp.id)
                .reduce((s, l) => s + l.qty * quantity, 0)
              const stockBefore = comp.stock
              const stockAfter = Math.max(0, stockBefore - req)
              return (
                <div key={comp.id} className="space-y-3 border border-border/80 rounded-xl p-4 bg-card">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">Impact Item</span>
                      <span className="font-extrabold text-foreground text-sm">{comp.name} ({comp.genericPN})</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-mono">
                      <div><span className="text-muted-foreground block text-[9px] uppercase">Before</span><span className="font-bold">{stockBefore.toLocaleString()}</span></div>
                      <div><span className="text-muted-foreground block text-[9px] uppercase">Batch Need</span><span className="font-bold text-amber-500">−{req.toLocaleString()}</span></div>
                      <div><span className="text-muted-foreground block text-[9px] uppercase">Est. After</span><span className={`font-bold ${stockAfter === 0 ? "text-destructive font-black" : "text-emerald-600"}`}>{stockAfter.toLocaleString()}</span></div>
                    </div>
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden bg-background">
                    <table className="w-full text-xs text-left text-foreground">
                      <thead className="bg-muted uppercase text-[10px] text-muted-foreground border-b border-border font-semibold">
                        <tr>
                          <th className="px-4 py-2">Brand / Manufacturer</th>
                          <th className="px-4 py-2">Part No.</th>
                          <th className="px-4 py-2 text-right">Stock Before</th>
                          <th className="px-4 py-2 text-right">Est. Stock After</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border font-semibold">
                        {comp.brandVariants.map((v) => {
                          const brandName = d.getBrandName(v.brandId)
                          const vBefore = v.stock
                          const vAfter = Math.max(0, vBefore - req)
                          return (
                            <tr key={v.brandId + v.partNo} className="hover:bg-muted/5">
                              <td className="px-4 py-2.5">{brandName}</td>
                              <td className="px-4 py-2.5 font-mono text-muted-foreground">{v.partNo}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{vBefore.toLocaleString()}</td>
                              <td className={`px-4 py-2.5 text-right font-mono ${vAfter === 0 ? "text-destructive font-black" : "text-emerald-600 dark:text-emerald-400"}`}>
                                {vAfter.toLocaleString()}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
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
                {d.PRODUCTS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
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
                    {SHORTAGES.map((s) => `${s.item} (−${s.missing.toLocaleString()})`).join(", ")} short for this batch run.
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
