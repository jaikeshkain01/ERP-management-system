"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle, ShieldAlert, AlertCircle, RefreshCw, Check, FileText } from "lucide-react"

interface ReadinessItem {
  component: string
  required: number
  available: number
  status: boolean
}

interface ShortageSupplier {
  brand: string
  supplierId: string
  supplierName: string
  price: string
  leadTime: string
}

export default function ProductionReadinessPage() {
  const [readinessItems, setReadinessItems] = React.useState<ReadinessItem[]>([
    { component: "Resistor 10K", required: 15000, available: 15000, status: true },
    { component: "Capacitor 100uF", required: 1000, available: 8000, status: true },
    { component: "LED Green", required: 700, available: 500, status: false },
  ])

  const [selectedSupplierIdx, setSelectedSupplierIdx] = React.useState<number>(0)
  const [toast, setToast] = React.useState<{ message: string; prId: string } | null>(null)
  const [auditRunning, setAuditRunning] = React.useState(false)

  const missingQty = 700 - 500 // 200

  const suppliers: ShortageSupplier[] = [
    { brand: "Panasonic", supplierId: "abc-electronics", supplierName: "ABC Electronics", price: "₹2.10", leadTime: "3 Days" },
    { brand: "Panasonic", supplierId: "xyz-components", supplierName: "XYZ Components", price: "₹2.20", leadTime: "2 Days" },
    { brand: "Samsung", supplierId: "mouser", supplierName: "Mouser", price: "₹2.30", leadTime: "5 Days" }
  ]

  const handleCreatePR = () => {
    const s = suppliers[selectedSupplierIdx] || suppliers[0]
    const prId = `PR-${Math.floor(100000 + Math.random() * 900000)}`
    const unitPrice = parseFloat(s.price.replace(/[^\d.]/g, ""))
    const totalCost = (missingQty * unitPrice).toFixed(2)
    
    setToast({
      message: `Successfully generated Purchase Request for ${missingQty.toLocaleString()} units of LED Green (Brand: ${s.brand}) from ${s.supplierName} (Total: ₹${parseFloat(totalCost).toLocaleString()})`,
      prId
    })

    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("mockup2_erp_purchase_requests")
      const currentList = saved ? JSON.parse(saved) : []
      const newPR = {
        prId,
        componentId: "led-green",
        componentName: "LED Green",
        brandId: s.brand.toLowerCase(),
        brandName: s.brand,
        supplierId: s.supplierId,
        supplierName: s.supplierName,
        qty: missingQty,
        totalCost: `₹${parseFloat(totalCost).toLocaleString()}`,
        status: "Pending Approval" as const,
        date: new Date().toISOString().split("T")[0]
      }
      localStorage.setItem("mockup2_erp_purchase_requests", JSON.stringify([newPR, ...currentList]))
    }

    setTimeout(() => {
      setToast(null)
    }, 4500)
  }

  const runAudit = () => {
    setAuditRunning(true)
    setTimeout(() => {
      setAuditRunning(false)
      // Done auditing
    }, 1000)
  }

  return (
    <div className="space-y-6">
      {/* Toast / Alert Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 p-4 rounded-xl shadow-lg transition-all animate-in fade-in slide-in-from-bottom-5 duration-300">
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
        <Button 
          variant="outline" 
          onClick={runAudit} 
          disabled={auditRunning}
          className="gap-2 self-start sm:self-auto border-border bg-background cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 ${auditRunning ? "animate-spin" : ""}`} />
          <span>{auditRunning ? "Auditing BOM..." : "Re-run Audit"}</span>
        </Button>
      </div>

      {/* Master Detail Layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Side: Table Checklist */}
        <Card className="lg:col-span-2 border border-border shadow-sm overflow-hidden">
          <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
            <CardTitle className="text-lg font-bold">Component Allocation Audit</CardTitle>
            <CardDescription>Simulated Batch: ROIP 400 (100 Units)</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left text-foreground">
                <thead className="text-xs uppercase bg-muted/40 text-muted-foreground border-b border-border">
                  <tr>
                    <th scope="col" className="px-6 py-3 font-semibold">Component</th>
                    <th scope="col" className="px-6 py-3 font-semibold">Required</th>
                    <th scope="col" className="px-6 py-3 font-semibold">Available</th>
                    <th scope="col" className="px-6 py-3 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {readinessItems.map((item) => (
                    <tr key={item.component} className="hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-4 font-semibold">{item.component}</td>
                      <td className="px-6 py-4 font-mono">{item.required.toLocaleString()}</td>
                      <td className="px-6 py-4 font-mono text-muted-foreground">{item.available.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right">
                        {item.status ? (
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
            </div>
          </CardContent>
        </Card>

        {/* Right Side: Sourcing & Sourcing Options Panel */}
        <div className="space-y-6">
          {/* Readiness Blocked Panel */}
          <Card className="border-destructive/30 bg-destructive/5 dark:bg-red-950/10 shadow-md">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="h-5 w-5" />
                <CardTitle className="text-lg font-extrabold uppercase tracking-wide">
                  Production Blocked
                </CardTitle>
              </div>
              <CardDescription className="text-destructive/80 mt-0.5">
                Batch release cancelled due to component shortages.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-lg">
                <span className="text-xs uppercase font-extrabold tracking-wider text-destructive/85 block">Missing Stock</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-sm font-bold text-foreground">LED Green</span>
                  <span className="text-lg font-mono font-extrabold text-destructive">-{missingQty.toLocaleString()} Units</span>
                </div>
              </div>

              {/* Recommended Suppliers Procurement Table */}
              <div className="space-y-2 pt-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
                  Procurement Sourcing Options
                </span>
                <div className="border border-border rounded-lg overflow-hidden bg-background">
                  <table className="w-full text-xs text-left text-foreground">
                    <thead className="bg-muted uppercase text-[10px] text-muted-foreground border-b border-border font-semibold">
                      <tr>
                        <th className="px-3 py-2">Select</th>
                        <th className="px-3 py-2">Brand</th>
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

              <div className="space-y-2 text-xs text-muted-foreground/85 pt-1">
                <div className="flex gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                  <span>Safety thresholds are satisfied for Resistor 10K and Capacitor 100uF.</span>
                </div>
              </div>
            </CardContent>
            <CardContent className="pt-0 pb-6">
              <Button 
                onClick={handleCreatePR} 
                className="w-full font-bold gap-2 cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground border-transparent"
              >
                <FileText className="h-4 w-4" />
                <span>Generate Purchase Request</span>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
