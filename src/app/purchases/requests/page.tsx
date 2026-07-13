"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertCircle, Check, FileText, ShoppingCart, ShoppingBag, Plus, Landmark, Award, Star, Clock } from "lucide-react"
import Link from "next/link"
import { StatStrip } from "@/components/stat-strip"
import { DragScrollArea } from "@/components/ui/drag-scroll-area"
import type {
  PurchaseRequestView as PurchaseRequest,
  SourcingRecommendation,
  RecommendationsView,
} from "@/lib/server/data/purchases"

function PurchaseRequestsContent() {
  const [recData, setRecData] = React.useState<RecommendationsView | null>(null)
  const [prList, setPrList] = React.useState<PurchaseRequest[]>([])
  const [mounted, setMounted] = React.useState(false)
  const [toast, setToast] = React.useState<string | null>(null)

  const RECOMMENDATIONS: SourcingRecommendation[] = recData?.recommendations ?? []
  const needQty = recData?.suggestedQty ?? 0
  const shortName = recData?.componentName ?? "—"
  const shortPN = recData?.componentPN ?? ""

  // Load PRs from the backend.
  const loadPrs = React.useCallback(async () => {
    try {
      const res = await fetch("/api/purchase-requests", { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (res.ok && body?.data) setPrList(body.data)
    } finally {
      setMounted(true)
    }
  }, [])

  React.useEffect(() => {
    loadPrs()
  }, [loadPrs])

  // Auto-pick the biggest current shortage and its sourcing options.
  React.useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch("/api/purchases/recommendations", { cache: "no-store" })
        const body = await res.json().catch(() => null)
        if (res.ok && body?.data) setRecData(body.data as RecommendationsView)
      } catch {
        /* ignore — panel just stays empty */
      }
    })()
  }, [])

  const showToast = (message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 3000)
  }

  const handleGeneratePR = async (rec: SourcingRecommendation) => {
    const res = await fetch("/api/purchase-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        componentPN: shortPN,
        brandSlug: rec.brandId,
        supplierSlug: rec.supplierId,
        qty: needQty,
      }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      showToast(body?.error?.message ?? "Failed to create Purchase Request")
      return
    }
    setPrList((prev) => [body.data, ...prev])
    showToast(`Purchase Request ${body.data.prId} created successfully for ${needQty} units of ${shortName}.`)
  }

  const handleApprovePR = async (prId: string) => {
    const res = await fetch(`/api/purchase-requests/${prId}/approve`, { method: "POST" })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      showToast(body?.error?.message ?? `Failed to approve ${prId}`)
      return
    }
    showToast(`Approved Purchase Request ${prId} — Purchase Order ${body.data.po} created!`)
    await loadPrs()
  }

  // Calculate statistics
  const totalOpen = prList.filter(p => p.status === "Pending Approval").length
  const totalApproved = prList.filter(p => p.status === "Approved").length
  const totalCostVal = prList.reduce((acc, p) => {
    const val = parseFloat(p.totalCost.replace(/[^\d.]/g, ""))
    return isNaN(val) ? acc : acc + val
  }, 0)

  if (!mounted) {
    return (
      <div className="flex h-[400px] items-center justify-center text-muted-foreground text-sm font-medium">
        Loading Purchase Requests...
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
          <span className="text-foreground font-medium">Purchase Requests</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Purchase Requests (PR)</h1>
        <p className="text-muted-foreground">
          BOM shortage requests pipeline and supplier recommendations validation.
        </p>
      </div>

      {/* KPI readout — instrument strip */}
      <StatStrip
        items={[
          { label: "Open Requests", value: totalOpen, desc: "Pending approval", icon: Clock, tone: "warning" },
          { label: "Approved Requests", value: totalApproved, desc: "Ready for order", icon: Check, tone: "success" },
          { label: "Estimated Pipeline Value", value: `₹${totalCostVal.toLocaleString()}`, desc: "INR total", icon: Landmark },
        ]}
      />

      {/* Main Grid: Shortage Sourcing Recommendations & Recent PR Table */}
      <div className="grid gap-6 lg:grid-cols-3 items-start">
        
        {/* Left Side: Shortage Sourcing Matrix */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border border-border shadow-sm overflow-hidden">
            <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                <div>
                  <CardTitle className="text-lg font-bold text-foreground">Active Shortage Sourcing</CardTitle>
                  <CardDescription>Procure missing components below threshold safety limits</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/10 dark:border-amber-500/20 p-4 rounded-lg gap-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-500 block">Shortage Item</span>
                  <Link
                    href={`/components/details?component=${shortPN}`}
                    className="text-lg font-extrabold text-foreground hover:underline mt-1 block"
                  >
                    {shortName}
                  </Link>
                </div>
                <div className="text-right sm:text-left">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">Needed Quantity</span>
                  <span className="text-2xl font-black text-destructive mt-1 block">{needQty.toLocaleString()} Units</span>
                </div>
              </div>

              {/* Sourcing Recommendations Table */}
              <div className="space-y-2 pt-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground block">Supplier Sourcing Recommendations</span>
                <div className="border border-border rounded-lg overflow-hidden bg-background">
                  <table className="w-full text-sm text-left text-foreground">
                    <thead className="bg-muted/40 uppercase text-xs text-muted-foreground border-b border-border font-semibold">
                      <tr>
                        <th className="px-4 py-3">Supplier</th>
                        <th className="px-4 py-3">Brand</th>
                        <th className="px-4 py-3">Unit Price</th>
                        <th className="px-4 py-3">Total Cost</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {RECOMMENDATIONS.map((rec, idx) => {
                        const priceVal = parseFloat(rec.price.replace(/[^\d.]/g, ""))
                        const total = (needQty * priceVal).toFixed(2)
                        return (
                          <tr key={idx} className="hover:bg-muted/10 transition-colors">
                            <td className="px-4 py-3.5 font-bold">
                              <Link href={`/suppliers/details?supplier=${rec.supplierId}`} className="hover:text-primary hover:underline">
                                {rec.supplierName}
                              </Link>
                            </td>
                            <td className="px-4 py-3.5 font-semibold text-muted-foreground">
                              <Link href={`/brands/list?brand=${rec.brandId}`} className="hover:text-primary hover:underline">
                                {rec.brandName}
                              </Link>
                            </td>
                            <td className="px-4 py-3.5 font-mono">{rec.price}</td>
                            <td className="px-4 py-3.5 font-mono text-primary font-bold">₹{parseFloat(total).toLocaleString()}</td>
                            <td className="px-4 py-3.5 text-right">
                              <Button 
                                size="sm" 
                                className="font-semibold cursor-pointer"
                                onClick={() => handleGeneratePR(rec)}
                              >
                                <span>Generate PR</span>
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Purchase Requests */}
          <Card className="border border-border shadow-sm overflow-hidden">
            <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-lg font-bold">Recent Purchase Requests Log</CardTitle>
                  <CardDescription>Review and approve component replenishment requests</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <DragScrollArea className="overflow-x-auto">
                <table className="w-full text-sm text-left text-foreground">
                  <thead className="bg-muted/40 uppercase text-xs text-muted-foreground border-b border-border font-semibold">
                    <tr>
                      <th className="px-6 py-3">PR Number</th>
                      <th className="px-6 py-3">Component</th>
                      <th className="px-6 py-3">Supplier (Brand)</th>
                      <th className="px-6 py-3">Quantity</th>
                      <th className="px-6 py-3">Total Cost</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {prList.map((pr) => (
                      <tr key={pr.prId} className="hover:bg-muted/10 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-primary">{pr.prId}</td>
                        <td className="px-6 py-4">
                          <Link href={`/components/details?component=${pr.componentId}`} className="font-semibold hover:underline">
                            {pr.componentName}
                          </Link>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-semibold text-foreground block">{pr.supplierName}</span>
                          <span className="text-xs text-muted-foreground">Brand: {pr.brandName}</span>
                        </td>
                        <td className="px-6 py-4 font-mono">{pr.qty.toLocaleString()}</td>
                        <td className="px-6 py-4 font-mono font-bold text-primary">{pr.totalCost}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold border ${
                            pr.status === "Approved"
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                              : "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
                          }`}>
                            {pr.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {pr.status === "Pending Approval" ? (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="font-bold border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/5 cursor-pointer"
                              onClick={() => handleApprovePR(pr.prId)}
                            >
                              <span>Approve</span>
                            </Button>
                          ) : (
                            <span className="text-xs font-semibold text-muted-foreground/40 font-mono">Approved</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {prList.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">
                          No purchase requests in queue.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </DragScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Sidebar Info */}
        <div className="space-y-6">
          <Card className="border border-border shadow-sm">
            <CardHeader className="border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg font-bold">PR Pipeline Guide</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4 text-xs text-muted-foreground leading-relaxed">
              <p>
                <strong>Purchase Requests (PR)</strong> are generated automatically when production readiness checks encounter material shortage conditions, or manually by sourcing managers.
              </p>
              <div className="border-t border-border/50 pt-3 space-y-2">
                <span className="font-bold text-foreground block">Workflow Process:</span>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Detect shortage in Audit Readiness.</li>
                  <li>Draft PR from recommendation sourcing pricing matrices.</li>
                  <li>Approved requests automatically compile and export to the Purchase Orders (PO) dispatch dashboard.</li>
                </ol>
              </div>
              <div className="border-t border-border/50 pt-3 flex justify-between">
                <Button variant="outline" className="w-full justify-center font-bold" render={<Link href="/purchases/orders" />}>
                  <span>Manage Purchase Orders</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function PurchaseRequestsPage() {
  return (
    <React.Suspense fallback={
      <div className="flex h-[400px] items-center justify-center text-muted-foreground text-sm font-medium">
        Loading Purchase Requests...
      </div>
    }>
      <PurchaseRequestsContent />
    </React.Suspense>
  )
}
