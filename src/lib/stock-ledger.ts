import type { Component, StockTransaction, StockDirection } from "@/mockdata/types"

/** Signed contribution of a transaction to a running balance. */
export function signedQty(t: StockTransaction): number {
  return t.direction === "in" ? t.qty : -t.qty
}

/** Current stock of a component = sum of its transaction movements. */
export function effectiveComponentStock(componentId: string, txns: StockTransaction[]): number {
  return txns.reduce((sum, t) => (t.componentId === componentId ? sum + signedQty(t) : sum), 0)
}

export type BrandStock = { brandId: string; partNo?: string; stock: number }

/**
 * Per-brand effective stock. Merges the catalog brand variants with any brand
 * that appears only in the ledger (a stock-in from a previously-unknown brand),
 * so newly sourced brands show up in the breakdown.
 */
export function effectiveBrandStocks(component: Component, txns: StockTransaction[]): BrandStock[] {
  const partNoByBrand = new Map(component.brandVariants.map((v) => [v.brandId, v.partNo]))
  const order: string[] = component.brandVariants.map((v) => v.brandId)
  const totals = new Map<string, number>()

  for (const v of component.brandVariants) totals.set(v.brandId, 0)
  for (const t of txns) {
    if (t.componentId !== component.id) continue
    if (!totals.has(t.brandId)) {
      totals.set(t.brandId, 0)
      order.push(t.brandId)
    }
    totals.set(t.brandId, (totals.get(t.brandId) ?? 0) + signedQty(t))
  }

  return order.map((brandId) => ({
    brandId,
    partNo: partNoByBrand.get(brandId),
    stock: totals.get(brandId) ?? 0,
  }))
}

export type LedgerRow = StockTransaction & { balance: number }

/**
 * A component's transactions with a running balance, oldest→newest by date then
 * insertion order. Callers can reverse for newest-first display.
 */
export function componentTxns(componentId: string, txns: StockTransaction[]): LedgerRow[] {
  const rows = txns
    .map((t, idx) => ({ t, idx }))
    .filter(({ t }) => t.componentId === componentId)
    .sort((a, b) => (a.t.date === b.t.date ? a.idx - b.idx : a.t.date < b.t.date ? -1 : 1))

  let balance = 0
  return rows.map(({ t }) => {
    balance += signedQty(t)
    return { ...t, balance }
  })
}

/** Effective stock for a single brand of a component (used for stock-out validation). */
export function effectiveBrandStock(componentId: string, brandId: string, txns: StockTransaction[]): number {
  return txns.reduce(
    (sum, t) => (t.componentId === componentId && t.brandId === brandId ? sum + signedQty(t) : sum),
    0,
  )
}

export type NewTransactionInput = {
  componentId: string
  brandId: string
  supplierId?: string
  direction: StockDirection
  qty: number
  note?: string
}

/** Builds a persisted transaction. Runtime only (uses new Date()). */
export function makeTransaction(input: NewTransactionInput): StockTransaction {
  const now = new Date()
  return {
    id: `txn-${now.getTime()}-${Math.floor(Math.random() * 1e6)}`,
    componentId: input.componentId,
    brandId: input.brandId,
    supplierId: input.supplierId || undefined,
    direction: input.direction,
    qty: Math.abs(input.qty),
    date: now.toISOString(),
    note: input.note?.trim() || undefined,
  }
}
