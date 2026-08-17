"use client"

import * as React from "react"
import { X, ArrowDownToLine, ArrowUpFromLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useData } from "@/lib/data-provider"
import type { StockDirection } from "@/lib/catalog"
import type { BrandStock, NewTransactionInput } from "@/lib/stock-ledger"

type Props = {
  mode: StockDirection
  componentId: string
  componentName: string
  brandStocks: BrandStock[]
  onSubmit: (input: NewTransactionInput) => void
  onClose: () => void
}

export function StockMoveModal({ mode, componentId, componentName, brandStocks, onSubmit, onClose }: Props) {
  const { BRANDS, SUPPLIERS, getBrandName } = useData()
  const isIn = mode === "in"

  // Existing brands first (so the common case is one click), then the rest.
  const existingIds = new Set(brandStocks.map((b) => b.brandId))
  const brandOptions = [
    ...brandStocks.map((b) => ({ id: b.brandId, name: getBrandName(b.brandId) })),
    ...BRANDS.filter((b) => !existingIds.has(b.id)).map((b) => ({ id: b.id, name: b.name })),
  ]

  const [brandId, setBrandId] = React.useState(brandOptions[0]?.id ?? "")
  const [supplierId, setSupplierId] = React.useState("")
  const [qty, setQty] = React.useState("")
  const [lotNo, setLotNo] = React.useState("")
  const [expiryDate, setExpiryDate] = React.useState("")
  const [note, setNote] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  const brandOnHand = brandStocks.find((b) => b.brandId === brandId)?.stock ?? 0

  const submit = () => {
    const n = Number(qty)
    if (!brandId) return setError("Select a manufacturer.")
    if (!Number.isFinite(n) || n <= 0) return setError("Enter a quantity greater than 0.")
    if (!isIn && n > brandOnHand) {
      return setError(`Only ${brandOnHand.toLocaleString()} in stock for ${getBrandName(brandId)}.`)
    }
    onSubmit({
      componentId,
      brandId,
      supplierId: isIn ? supplierId || undefined : undefined,
      direction: mode,
      qty: n,
      note,
      ...(isIn ? { lotNo, expiryDate } : {}),
    })
  }

  const accent = isIn
    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : "bg-amber-500/10 text-amber-600 dark:text-amber-400"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
              {isIn ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold">{isIn ? "Stock In" : "Stock Out"}</h3>
              <p className="text-xs text-muted-foreground">{componentName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Manufacturer</label>
            <select
              value={brandId}
              onChange={(e) => { setBrandId(e.target.value); setError(null) }}
              className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
            >
              {brandOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}{existingIds.has(b.id) ? "" : " (new)"}
                </option>
              ))}
            </select>
            {!isIn && (
              <p className="text-[11px] text-muted-foreground">On hand: {brandOnHand.toLocaleString()}</p>
            )}
          </div>

          {isIn && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Supplier (source)</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">— Select supplier —</option>
                {SUPPLIERS.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Quantity</label>
            <Input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => { setQty(e.target.value); setError(null) }}
              placeholder="e.g. 2000"
            />
          </div>

          {isIn && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Lot / Batch No.</label>
                <Input value={lotNo} onChange={(e) => setLotNo(e.target.value)} placeholder="blank → auto" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Expiry (optional)</label>
                <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Note (optional)</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reference or reason" />
          </div>

          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit}>{isIn ? "Add stock" : "Remove stock"}</Button>
        </div>
      </div>
    </div>
  )
}
