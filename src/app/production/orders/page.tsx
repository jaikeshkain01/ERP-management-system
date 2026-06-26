"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ClipboardList, GripVertical, Plus } from "lucide-react"
import { PRODUCTION_ORDERS, type ProductionOrder } from "@/mockdata/production"

type StatusColumn = "Draft" | "Ready" | "In Progress" | "Completed"

export default function ProductionOrdersPage() {
  const [orders, setOrders] = React.useState<ProductionOrder[]>(PRODUCTION_ORDERS)
  const [draggingId, setDraggingId] = React.useState<string | null>(null)

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id)
    e.dataTransfer.setData("text/plain", id)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleDragEnd = () => {
    setDraggingId(null)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent, newStatus: StatusColumn) => {
    e.preventDefault()
    const id = e.dataTransfer.getData("text/plain")
    if (id) {
      setOrders((prev) =>
        prev.map((order) => (order.id === id ? { ...order, status: newStatus } : order))
      )
    }
    setDraggingId(null)
  }

  const columns: { status: StatusColumn; label: string; color: string }[] = [
    { status: "Draft", label: "Draft", color: "bg-muted/80 text-muted-foreground border-border" },
    { status: "Ready", label: "Ready", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
    { status: "In Progress", label: "In Progress", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
    { status: "Completed", label: "Completed", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  ]

  return (
    <div className="space-y-6">
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
            Manage shop floor batches and transition work orders along the assembly line.
          </p>
        </div>
        <Button className="gap-2 font-semibold self-start sm:self-auto">
          <Plus className="h-4 w-4" />
          <span>New Order</span>
        </Button>
      </div>

      {/* Kanban Board Grid */}
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
              {/* Column Header */}
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold border ${col.color}`}>
                  {col.label}
                </span>
                <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {colOrders.length}
                </span>
              </div>

              {/* Column Cards Container */}
              <div className="flex flex-col gap-3 flex-1">
                {colOrders.map((order) => (
                  <div
                    key={order.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, order.id)}
                    onDragEnd={handleDragEnd}
                    className={`cursor-grab active:cursor-grabbing group border border-border rounded-lg bg-background p-4 shadow-2xs hover:shadow-md hover:border-primary/20 transition-all ${
                      draggingId === order.id ? "opacity-40 scale-95" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <span className="text-xs font-mono font-bold text-primary block">
                          {order.id}
                        </span>
                        <span className="font-extrabold text-foreground text-sm block truncate">
                          {order.product}
                        </span>
                        <span className="text-xs text-muted-foreground block">
                          Qty: <strong className="font-semibold text-foreground">{order.qty}</strong>
                        </span>
                      </div>
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 group-hover:text-muted-foreground/80 transition-colors">
                        <GripVertical className="h-4 w-4" />
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
    </div>
  )
}
