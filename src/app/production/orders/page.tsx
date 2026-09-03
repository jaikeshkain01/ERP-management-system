"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ClipboardList, GripVertical, Plus, X, Check, AlertCircle, Loader2, ListTree, Ban } from "lucide-react"
import { useAssembledItems } from "@/lib/use-assembled-items"
import { extractError } from "@/lib/api-error"
import type { ProductionOrderView as ProductionOrder } from "@/lib/server/data/production"

type StatusColumn = "Draft" | "Ready" | "In Progress" | "Completed"

// Lifecycle ordering + the endpoint that advances an order INTO each stage.
const STAGE_ORDER: StatusColumn[] = ["Draft", "Ready", "In Progress", "Completed"]
const STAGE_ENDPOINT: Record<Exclude<StatusColumn, "Draft">, string> = {
  Ready: "allocations",
  "In Progress": "consumptions",
  Completed: "complete",
}

type OrderView = ProductionOrder

interface PlanItem {
  id: string
  genericPN: string
  componentName: string
  requiredQty: number
  allocated: number
  consumed: number
  available: number
  status: "pending" | "allocated" | "consumed" | "short"
}

export default function ProductionOrdersPage() {
  // Assembled items — retired `d.PRODUCTS`, fetched from /api/items instead.
  const { items: assembledItems } = useAssembledItems()
  const [orders, setOrders] = React.useState<OrderView[]>([])
  const [loaded, setLoaded] = React.useState(false)
  const [draggingId, setDraggingId] = React.useState<string | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [toast, setToast] = React.useState<{ message: string; hint?: string; type: "success" | "error" } | null>(null)

  const [showNew, setShowNew] = React.useState(false)
  const [planFor, setPlanFor] = React.useState<string | null>(null)
  const [cancelFor, setCancelFor] = React.useState<OrderView | null>(null)

  const showToast = (msgOrInfo: string | { message: string; hint?: string }, type: "success" | "error" = "success") => {
    const info = typeof msgOrInfo === "string" ? { message: msgOrInfo } : msgOrInfo
    setToast({ ...info, type })
    setTimeout(() => setToast(null), type === "error" ? 6000 : 3000)
  }

  const loadOrders = React.useCallback(async () => {
    try {
      const res = await fetch("/api/production-orders", { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (res.ok && body?.data) setOrders(body.data)
    } finally {
      setLoaded(true)
    }
  }, [])

  React.useEffect(() => {
    loadOrders()
  }, [loadOrders])

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id)
    e.dataTransfer.setData("text/plain", id)
    e.dataTransfer.effectAllowed = "move"
  }
  const handleDragEnd = () => setDraggingId(null)
  const handleDragOver = (e: React.DragEvent) => e.preventDefault()

  // Dropping a card advances it one stage by calling the matching lifecycle endpoint.
  const handleDrop = async (e: React.DragEvent, target: StatusColumn) => {
    e.preventDefault()
    setDraggingId(null)
    const id = e.dataTransfer.getData("text/plain")
    const order = orders.find((o) => o.id === id)
    if (!order) return

    const fromIdx = STAGE_ORDER.indexOf(order.status as StatusColumn)
    const toIdx = STAGE_ORDER.indexOf(target)
    if (toIdx === fromIdx) return // dropped back into its own column
    if (toIdx !== fromIdx + 1) {
      showToast(`Can't move ${order.id} straight to ${target} — advance one stage at a time.`, "error")
      return
    }

    const endpoint = STAGE_ENDPOINT[target as Exclude<StatusColumn, "Draft">]
    setBusyId(id)
    try {
      const res = await fetch(`/api/production-orders/${id}/${endpoint}`, { method: "POST" })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        const shorts = body?.error?.details?.shorts
        if (shorts?.length) {
          const { hint } = extractError(body, "")
          showToast(
            { message: `${order.id}: ${shorts.length} item${shorts.length > 1 ? "s" : ""} short — can't reserve stock.`, hint },
            "error",
          )
        } else {
          showToast(extractError(body, `Failed to advance ${order.id}`), "error")
        }
        return
      }
      const msg: Record<StatusColumn, string> = {
        Draft: "",
        Ready: `${order.id} allocated — stock reserved for the batch.`,
        "In Progress": `${order.id} released to the floor — items consumed from inventory.`,
        Completed: `${order.id} completed — batch closed.`,
      }
      showToast(msg[target])
      await loadOrders()
    } finally {
      setBusyId(null)
    }
  }

  // Cancel a Draft/Ready order (releases any reservations on the backend).
  const handleCancel = async () => {
    if (!cancelFor) return
    const id = cancelFor.id
    setBusyId(id)
    try {
      const res = await fetch(`/api/production-orders/${id}/cancel`, { method: "POST" })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        showToast(extractError(body, `Failed to cancel ${id}`), "error")
        return
      }
      showToast(`${id} cancelled${body?.data?.released ? ` — ${body.data.released} reservation(s) released` : ""}.`)
      setCancelFor(null)
      await loadOrders()
    } finally {
      setBusyId(null)
    }
  }

  const columns: { status: StatusColumn; label: string; color: string }[] = [
    { status: "Draft", label: "Draft", color: "bg-muted/80 text-muted-foreground border-border" },
    { status: "Ready", label: "Ready", color: "bg-primary/10 text-primary border-primary/20" },
    { status: "In Progress", label: "In Progress", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
    { status: "Completed", label: "Completed", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  ]

  if (!loaded) {
    return (
      <div className="flex h-[400px] items-center justify-center text-muted-foreground text-sm font-medium">
        Loading Production Orders...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-[70] max-w-md p-4 rounded-xl shadow-lg border transition-all animate-in fade-in slide-in-from-bottom-5 duration-300 bg-background ${
            toast.type === "error"
              ? "border-destructive/35 text-destructive"
              : "border-emerald-500/35 text-emerald-600 dark:text-emerald-400"
          }`}
        >
          <div className="flex items-start gap-2">
            {toast.type === "error" ? <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" /> : <Check className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />}
            <div className="min-w-0">
              <div className="text-sm font-semibold">{toast.message}</div>
              {toast.hint && <div className="mt-1 text-xs font-medium text-muted-foreground">{toast.hint}</div>}
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
            <span className="text-foreground font-medium">Production Orders</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Production Orders</h1>
          <p className="text-muted-foreground">
            Drag a batch to the next lane to allocate stock, release it to the floor, and close it out.
          </p>
        </div>
        <Button className="gap-2 font-semibold self-start sm:self-auto cursor-pointer" onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4" />
          <span>New Order</span>
        </Button>
      </div>

      {/* Kanban Board */}
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4 items-start">
        {columns.map((col) => {
          const colOrders = orders.filter((order) => order.status === col.status)
          return (
            <div
              key={col.status}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.status)}
              className="flex flex-col gap-4 bg-muted/20 border border-border p-4 rounded-xl min-h-[600px] transition-all duration-200"
            >
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold border ${col.color}`}>
                  {col.label}
                </span>
                <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {colOrders.length}
                </span>
              </div>

              <div className="flex flex-col gap-3 flex-1">
                {colOrders.map((order) => (
                  <div
                    key={order.id}
                    draggable={busyId !== order.id}
                    onDragStart={(e) => handleDragStart(e, order.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => setPlanFor(order.id)}
                    className={`cursor-grab active:cursor-grabbing group border border-border rounded-lg bg-background p-4 shadow-2xs hover:shadow-md hover:border-primary/20 transition-all ${
                      draggingId === order.id ? "opacity-40 scale-95" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <span className="text-xs font-mono font-bold text-primary block">{order.id}</span>
                        <span className="font-extrabold text-foreground text-sm block truncate">{order.product}</span>
                        <span className="text-xs text-muted-foreground block">
                          Qty: <strong className="font-semibold text-foreground">{order.qty}</strong>
                        </span>
                        {order.targetDate && (
                          <span className="text-[10px] text-muted-foreground/80 font-mono block">Target {order.targetDate}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {(order.status === "Draft" || order.status === "Ready") && busyId !== order.id && (
                          <button
                            type="button"
                            title="Cancel order"
                            onClick={(e) => { e.stopPropagation(); setCancelFor(order) }}
                            className="hidden group-hover:flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <div className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/40 group-hover:text-muted-foreground/80 transition-colors">
                          {busyId === order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <GripVertical className="h-4 w-4" />}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {colOrders.length === 0 && (
                  <div className="flex flex-col items-center justify-center flex-1 py-12 border-2 border-dashed border-border/60 rounded-lg text-center p-4">
                    <ClipboardList className="h-8 w-8 text-muted-foreground/30" />
                    <span className="text-xs font-medium text-muted-foreground/60 mt-1">No Orders</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {showNew && <NewOrderModal onClose={() => setShowNew(false)} onCreated={loadOrders} showToast={showToast} products={assembledItems} />}
      {planFor && <PlanModal orderId={planFor} onClose={() => setPlanFor(null)} />}

      {/* Cancel confirm */}
      {cancelFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4" onClick={() => setCancelFor(null)}>
          <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-4">
              <h3 className="text-base font-extrabold">Cancel Production Order</h3>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full cursor-pointer" onClick={() => setCancelFor(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/25 p-3 rounded-xl text-destructive text-xs leading-relaxed font-semibold">
                <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
                <p>Cancelling <span className="font-mono">{cancelFor.id}</span> ({cancelFor.product}) releases any reserved stock. Only Draft/Ready orders can be cancelled.</p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button type="button" variant="outline" className="font-semibold cursor-pointer" onClick={() => setCancelFor(null)}>Keep Order</Button>
                <Button type="button" onClick={handleCancel} disabled={busyId === cancelFor.id} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold min-w-[110px]">
                  {busyId === cancelFor.id ? "Cancelling…" : "Cancel Order"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── New Order modal (STAGE 1 create) ─────────────────────────────────────────────
function NewOrderModal({
  onClose,
  onCreated,
  showToast,
  products,
}: {
  onClose: () => void
  onCreated: () => Promise<void>
  showToast: (m: string | { message: string; hint?: string }, t?: "success" | "error") => void
  products: { id: string; name: string; code?: string }[]
}) {
  const [product, setProduct] = React.useState(products[0]?.id ?? "")
  const [qty, setQty] = React.useState(100)
  const [targetDate, setTargetDate] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!product || qty < 1) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/production-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, qty, ...(targetDate ? { targetDate } : {}) }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        showToast(extractError(body, "Failed to create production order"), "error")
        return
      }
      showToast(`Production order ${body?.data?.id ?? ""} created — BOM demand planned.`)
      await onCreated()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-4">
          <h3 className="text-base font-extrabold">New Production Order</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full cursor-pointer" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Product</label>
            <select
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quantity</label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 0)} className="font-mono font-bold" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Target Date</label>
              <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="font-mono" />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="outline" className="font-semibold cursor-pointer" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="font-semibold cursor-pointer min-w-[110px]">
              {submitting ? "Creating…" : "Create Order"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Plan modal (STAGE 1 items view) ──────────────────────────────────────────────
function PlanModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [items, setItems] = React.useState<PlanItem[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    ;(async () => {
      const res = await fetch(`/api/production-orders/${orderId}/items`, { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (!active) return
      if (res.ok && body?.data) setItems(body.data)
      else setError(body?.error?.message ?? "Failed to load the material plan")
    })()
    return () => {
      active = false
    }
  }, [orderId])

  const statusBadge = (s: PlanItem["status"]) => {
    const map: Record<PlanItem["status"], string> = {
      pending: "bg-muted text-muted-foreground border-border",
      allocated: "bg-primary/10 text-primary border-primary/20",
      consumed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
      short: "bg-destructive/10 text-destructive border-destructive/20",
    }
    return map[s]
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-4">
          <div className="flex items-center gap-2">
            <ListTree className="h-5 w-5 text-primary" />
            <h3 className="text-base font-extrabold">Material Plan — <span className="font-mono text-primary">{orderId}</span></h3>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full cursor-pointer" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-auto p-5">
          {error ? (
            <p className="text-sm text-destructive font-medium py-6 text-center">{error}</p>
          ) : !items ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading plan…</p>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/40 uppercase text-[10px] text-muted-foreground border-b border-border font-semibold">
                  <tr>
                    <th className="px-4 py-2.5">Item</th>
                    <th className="px-4 py-2.5 text-right">Required</th>
                    <th className="px-4 py-2.5 text-right">Available</th>
                    <th className="px-4 py-2.5 text-right">Allocated</th>
                    <th className="px-4 py-2.5 text-right">Consumed</th>
                    <th className="px-4 py-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((it) => (
                    <tr key={it.id} className="hover:bg-muted/10">
                      <td className="px-4 py-2.5">
                        <span className="font-semibold block">{it.componentName}</span>
                        <span className="text-[11px] font-mono text-muted-foreground">{it.genericPN}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold">{it.requiredQty.toLocaleString()}</td>
                      <td className={`px-4 py-2.5 text-right font-mono ${it.available < it.requiredQty ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                        {it.available.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">{it.allocated.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{it.consumed.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border capitalize ${statusBadge(it.status)}`}>
                          {it.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No planned items.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
