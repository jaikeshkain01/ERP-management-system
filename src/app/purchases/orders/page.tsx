"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Truck, ShoppingCart, Check, ShieldAlert, Award, FileSpreadsheet, PackageCheck, AlertCircle, Landmark } from "lucide-react"
import Link from "next/link"
import { StatStrip } from "@/components/stat-strip"
import type { PurchaseOrderView as PurchaseOrder } from "@/lib/server/data/purchases"
import { DragScrollArea } from "@/components/ui/drag-scroll-area"

function PurchaseOrdersContent() {
  const [poList, setPoList] = React.useState<PurchaseOrder[]>([])
  const [mounted, setMounted] = React.useState(false)
  const [toast, setToast] = React.useState<string | null>(null)

  // Load POs from the backend.
  const loadPos = React.useCallback(async () => {
    try {
      const res = await fetch("/api/purchase-orders", { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (res.ok && body?.data) setPoList(body.data)
    } finally {
      setMounted(true)
    }
  }, [])

  React.useEffect(() => {
    loadPos()
  }, [loadPos])

  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 3000)
  }

  // Goods-in: appends inventory IN ledger rows server-side, PO → Completed.
  const handleReceiveOrder = async (poId: string) => {
    const res = await fetch(`/api/purchase-orders/${poId}/receive`, { method: "POST" })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      showToast(body?.error?.message ?? `Failed to receive ${poId}`)
      return
    }
    showToast(`Marked Purchase Order ${poId} as Completed — stock received into inventory!`)
    await loadPos()
  }

  // Calculate statistics
  const totalSent = poList.filter(o => o.status === "Sent").length
  const totalDispatched = poList.filter(o => o.status === "Dispatched").length
  const totalCompleted = poList.filter(o => o.status === "Completed").length
  const totalSpend = poList.reduce((acc, o) => {
    const val = parseFloat(o.totalCost.replace(/[^\d.]/g, ""))
    return isNaN(val) ? acc : acc + val
  }, 0)

  if (!mounted) {
    return (
      <div className="flex h-[400px] items-center justify-center text-muted-foreground text-sm font-medium">
        Loading Purchase Orders...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
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
          <span>Purchase</span>
          <span>/</span>
          <span className="text-foreground font-medium">Purchase Orders</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Purchase Orders (PO)</h1>
        <p className="text-muted-foreground">
          Track and receive material shipment dispatch notes from supplier partners.
        </p>
      </div>

      {/* KPI readout — instrument strip */}
      <StatStrip
        items={[
          { label: "In Transit", value: totalDispatched + totalSent, desc: "Shipped / ordered", icon: Truck },
          { label: "Completed Receipts", value: totalCompleted, desc: "Stock received", icon: PackageCheck, tone: "success" },
          { label: "Total Spend Volume", value: `₹${totalSpend.toLocaleString()}`, desc: "Committed costs", icon: Landmark },
        ]}
      />

      {/* Main Grid: PO Table & Sourcing Guidelines */}
      <div className="grid gap-6 lg:grid-cols-3 items-start">
        
        {/* Left Side: Purchase Orders Table */}
        <Card className="lg:col-span-2 border border-border shadow-sm overflow-hidden">
          <CardHeader className="border-b border-border bg-muted/20 px-6 py-4 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-lg font-bold">Purchase Orders Ledger</CardTitle>
                <CardDescription>Verify active shipping batches and delivery receipts</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <DragScrollArea className="overflow-x-auto">
              <table className="w-full text-sm text-left text-foreground">
                <thead className="bg-muted/40 uppercase text-xs text-muted-foreground border-b border-border font-semibold">
                  <tr>
                    <th className="px-6 py-3">PO Number</th>
                    <th className="px-6 py-3">Item</th>
                    <th className="px-6 py-3">Supplier</th>
                    <th className="px-6 py-3">Quantity</th>
                    <th className="px-6 py-3">Total Cost</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {poList.map((po) => (
                    <tr key={po.poId} className="hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-primary">{po.poId}</td>
                      <td className="px-6 py-4">
                        <span className="font-semibold block">{po.componentName}</span>
                        <span className="text-xs text-muted-foreground">Manufacturer: {po.brandName}</span>
                      </td>
                      <td className="px-6 py-4 font-semibold">{po.supplierName}</td>
                      <td className="px-6 py-4 font-mono">{po.qty.toLocaleString()}</td>
                      <td className="px-6 py-4 font-mono font-bold text-primary">{po.totalCost}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold border ${
                          po.status === "Completed"
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                            : po.status === "Dispatched"
                            ? "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400"
                            : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
                        }`}>
                          {po.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {po.status !== "Completed" ? (
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="font-bold gap-1 border-primary/20 hover:bg-primary/5 cursor-pointer"
                            onClick={() => handleReceiveOrder(po.poId)}
                          >
                            <PackageCheck className="h-3.5 w-3.5 text-primary" />
                            <span>Receive</span>
                          </Button>
                        ) : (
                          <span className="text-xs font-semibold text-muted-foreground/45 font-mono">Received</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {poList.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">
                        No purchase orders dispatched yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </DragScrollArea>
          </CardContent>
        </Card>

        {/* Right Side: Information Guide */}
        <div className="space-y-6">
          <Card className="border border-border shadow-sm">
            <CardHeader className="border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg font-bold">Delivery Guidelines</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4 text-xs text-muted-foreground leading-relaxed">
              <p>
                <strong>Purchase Orders (PO)</strong> are generated automatically from Approved Purchase Requests. These represent legal procurement agreements sent directly to suppliers.
              </p>
              <div className="border-t border-border/50 pt-3 space-y-2">
                <span className="font-bold text-foreground block">Stock Replenishment:</span>
                <p>
                  Clicking <strong>Receive</strong> updates the status to Completed, confirming delivery of materials. In a full ERP cycle, this action increments physical item inventory.
                </p>
              </div>
              <div className="border-t border-border/50 pt-3 flex justify-between">
                <Button variant="outline" className="w-full justify-center font-bold" render={<Link href="/purchases/requests" />}>
                  <span>Review Purchase Requests</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function PurchaseOrdersPage() {
  return (
    <React.Suspense fallback={
      <div className="flex h-[400px] items-center justify-center text-muted-foreground text-sm font-medium">
        Loading Purchase Orders...
      </div>
    }>
      <PurchaseOrdersContent />
    </React.Suspense>
  )
}
