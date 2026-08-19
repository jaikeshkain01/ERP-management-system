"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle, ShieldAlert, AlertCircle, RefreshCw, Check, FileText } from "lucide-react"
import type { ReadinessView } from "@/lib/server/data/production"
import { useData } from "@/lib/data-provider"
import { useModules } from "@/components/module-provider"
import { DragScrollArea } from "@/components/ui/drag-scroll-area"

export default function ProductionReadinessPage() {
  const d = useData()
  const { isEnabled } = useModules()
  const inventoryOn = isEnabled("inventory")
  const purchasingOn = isEnabled("purchasing")

  const products = d.PRODUCTS
  const [productSlug, setProductSlug] = React.useState<string>("")
  const [qty, setQty] = React.useState<number>(100)
  const [readiness, setReadiness] = React.useState<ReadinessView | null>(null)
  const [selectedSupplierIdx, setSelectedSupplierIdx] = React.useState<number>(0)
  const [toast, setToast] = React.useState<{ message: string; prId: string } | null>(null)
  const [auditRunning, setAuditRunning] = React.useState(false)

  const loadReadiness = React.useCallback(async () => {
    setAuditRunning(true)
    try {
      const params = new URLSearchParams()
      if (productSlug) params.set("product", productSlug)
      params.set("qty", String(qty || 1))
      const res = await fetch(`/api/production/readiness?${params}`, { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (res.ok && body?.data) {
        const data = body.data as ReadinessView
        setReadiness(data)
        setSelectedSupplierIdx(0)
        // Adopt the auto-picked product so the selector reflects what's shown.
        if (!productSlug && data.productSlug) setProductSlug(data.productSlug)
      }
    } finally {
      setAuditRunning(false)
    }
  }, [productSlug, qty])

  React.useEffect(() => {
    loadReadiness()
  }, [loadReadiness])

  const readinessItems = readiness?.items ?? []
  const suppliers = readiness?.sourcing ?? []
  const missingQty = readiness?.missingQty ?? 0
  const READINESS_SHORT_COMPONENT = readiness?.shortComponent ?? "—"
  const READINESS_SHORT_PN = readiness?.shortPN ?? ""

  const handleCreatePR = async () => {
    const s = suppliers[selectedSupplierIdx] || suppliers[0]
    const unitPrice = parseFloat(s.price.replace(/[^\d.]/g, ""))
    const totalCost = (missingQty * unitPrice).toFixed(2)

    const res = await fetch("/api/purchase-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        componentPN: READINESS_SHORT_PN,
        brandSlug: s.brandId,
        supplierSlug: s.supplierId,
        qty: missingQty,
        remarks: "Generated from production readiness audit",
      }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      setToast({ message: body?.error?.message ?? "Failed to create Purchase Request", prId: "—" })
    } else {
      setToast({
        message: `Successfully generated Purchase Request for ${missingQty.toLocaleString()} units of ${READINESS_SHORT_COMPONENT} (Manufacturer: ${s.brand}) from ${s.supplierName} (Total: ₹${parseFloat(totalCost).toLocaleString()})`,
        prId: body.data.prId,
      })
    }

    setTimeout(() => {
      setToast(null)
    }, 4500)
  }

  return (
    <div className="space-y-6">
      {/* Toast / Alert Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-[70] max-w-md bg-background border border-emerald-500/35 text-emerald-600 dark:text-emerald-400 p-4 rounded-xl shadow-lg transition-all animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-start gap-3">
            <Check className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <span className="font-extrabold text-sm block text-emerald-600 dark:text-emerald-400">Purchase Request Generated</span>
              <span className="text-xs text-muted-foreground leading-normal block">{toast.message}</span>
              <span className="inline-flex items-center gap-1 mt-2 text-[10px] uppercase font-bold tracking-wider bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-700 dark:text-emerald-300 font-mono">
                Ref: {toast.prId}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <span>Production</span>
            <span>/</span>
            <span className="text-foreground font-medium">Production Readiness</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Production Readiness</h1>
          <p className="text-muted-foreground">
            Verify if raw material stock is sufficient to execute scheduled batches.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3 self-start sm:self-auto">
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
            Product
            <select
              value={productSlug}
              onChange={(e) => setProductSlug(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground cursor-pointer"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
            Batch Qty
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              className="h-9 w-24 rounded-md border border-border bg-background px-2 text-sm font-mono text-foreground"
            />
          </label>
          {inventoryOn && (
            <Button
              variant="outline"
              onClick={loadReadiness}
              disabled={auditRunning}
              className="h-9 gap-2 border-border bg-background cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${auditRunning ? "animate-spin" : ""}`} />
              <span>{auditRunning ? "Auditing BOM..." : "Re-run Audit"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Master Detail Layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Side: Table Checklist */}
        <Card className="lg:col-span-2 border border-border shadow-sm overflow-hidden">
          <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
            <CardTitle className="text-lg font-bold">Item Allocation Audit</CardTitle>
            <CardDescription>
              {readiness ? `Batch: ${readiness.product} (${readiness.qty.toLocaleString()} Units)` : "Select a product and batch quantity"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <DragScrollArea className="overflow-x-auto">
              <table className="w-full text-sm text-left text-foreground">
                <thead className="text-xs uppercase bg-muted/40 text-muted-foreground border-b border-border">
                  <tr>
                    <th scope="col" className="px-6 py-3 font-semibold">Item</th>
                    <th scope="col" className="px-6 py-3 font-semibold">Required</th>
                    {inventoryOn && <th scope="col" className="px-6 py-3 font-semibold">Available</th>}
                    <th scope="col" className="px-6 py-3 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {readinessItems.map((item, idx) => (
                    <tr key={`${item.genericPN || item.component}-${idx}`} className="hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-4 font-semibold">{item.component}</td>
                      <td className="px-6 py-4 font-mono">{item.required.toLocaleString()}</td>
                      {inventoryOn && <td className="px-6 py-4 font-mono text-muted-foreground">{item.available.toLocaleString()}</td>}
                      <td className="px-6 py-4 text-right">
                        {!inventoryOn ? (
                          <span className="text-sm text-muted-foreground">Audit unavailable</span>
                        ) : item.status ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                            <span>Ready</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-destructive font-semibold text-sm animate-pulse">
                            <XCircle className="h-5 w-5 text-destructive" />
                            <span>Shortage ({(item.required - item.available).toLocaleString()})</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DragScrollArea>
          </CardContent>
        </Card>

        {/* Right Side: Sourcing & Sourcing Options Panel */}
        <div className="space-y-6">
          {!inventoryOn ? (
            <Card className="border border-border shadow-sm">
              <CardContent className="p-6 flex gap-3 text-sm text-muted-foreground">
                <AlertCircle className="h-5 w-5 shrink-0 text-muted-foreground/60 mt-0.5" />
                <span>Stock auditing requires the Inventory module. Shortage detection and blocked-batch alerts are unavailable.</span>
              </CardContent>
            </Card>
          ) : (
          <Card className="border-destructive/30 bg-destructive/5 dark:bg-red-950/10 shadow-md">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-5 w-5" />
                <CardTitle className="text-lg font-extrabold uppercase tracking-wide">
                  Production Blocked
                </CardTitle>
              </div>
              <CardDescription className="text-destructive/80 mt-0.5">
                Batch release cancelled due to item shortages.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-lg">
                <span className="text-xs uppercase font-extrabold tracking-wider text-destructive/85 block">Missing Stock</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-sm font-bold text-foreground">{READINESS_SHORT_COMPONENT}</span>
                  <span className="text-lg font-mono font-extrabold text-destructive">-{missingQty.toLocaleString()} Units</span>
                </div>
              </div>

              {/* Recommended Suppliers Procurement Table */}
              {purchasingOn && (
              <div className="space-y-2 pt-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                  Procurement Sourcing Options
                </span>
                <div className="border border-border rounded-lg overflow-hidden bg-background">
                  <table className="w-full text-xs text-left text-foreground">
                    <thead className="bg-muted uppercase text-[10px] text-muted-foreground border-b border-border font-semibold">
                      <tr>
                        <th className="px-3 py-2">Select</th>
                        <th className="px-3 py-2">Manufacturer</th>
                        <th className="px-3 py-2">Supplier</th>
                        <th className="px-3 py-2 text-right">Price</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {suppliers.map((s, idx) => (
                        <tr 
                          key={idx} 
                          className={`hover:bg-muted/30 cursor-pointer transition-colors ${
                            selectedSupplierIdx === idx ? "bg-muted/50 font-medium" : ""
                          }`}
                          onClick={() => setSelectedSupplierIdx(idx)}
                        >
                          <td className="px-3 py-2.5">
                            <input 
                              type="radio" 
                              name="supplier-source"
                              checked={selectedSupplierIdx === idx}
                              onChange={() => setSelectedSupplierIdx(idx)}
                              className="h-3.5 w-3.5 text-primary focus:ring-primary border-border bg-transparent cursor-pointer"
                            />
                          </td>
                          <td className="px-3 py-2.5 font-bold text-muted-foreground">{s.brand}</td>
                          <td className="px-3 py-2.5 font-semibold">{s.supplierName}</td>
                          <td className="px-3 py-2.5 font-mono text-right text-primary font-bold">{s.price}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              )}

              {!purchasingOn && (
                <div className="flex gap-2 text-xs text-muted-foreground/85 pt-1">
                  <AlertCircle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                  <span>Purchasing module required to raise requests.</span>
                </div>
              )}

              <div className="space-y-2 text-xs text-muted-foreground/85 pt-1">
                <div className="flex gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                  <span>Safety thresholds are satisfied for Resistor 10K and Capacitor 100uF.</span>
                </div>
              </div>
            </CardContent>
            {purchasingOn && (
            <CardContent className="pt-0 pb-6">
              <Button
                onClick={handleCreatePR}
                className="w-full font-bold gap-2 cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground border-transparent"
              >
                <FileText className="h-4 w-4" />
                <span>Generate Purchase Request</span>
              </Button>
            </CardContent>
            )}
          </Card>
          )}
        </div>
      </div>
    </div>
  )
}
