"use client"

import * as React from "react"
import type { StockTransaction } from "@/mockdata/types"
import type { NewTransactionInput } from "@/lib/stock-ledger"

export type MoveResult = { ok: boolean; error?: string }

type StockLedger = {
  transactions: StockTransaction[]
  /** Append a movement to the real ledger (POST). Resolves to ok/error. */
  addTransaction: (input: NewTransactionInput) => Promise<MoveResult>
  hydrated: boolean
}

interface BalanceRow {
  genericPN: string
  brandSlug: string
  variantId: string
  locationId: string
}
interface LedgerRowDTO {
  id: string
  genericPN: string
  brandSlug: string
  qtyDelta: number
  createdAt: string
  note: string | null
}

async function getData<T>(url: string): Promise<T[]> {
  const res = await fetch(url, { cache: "no-store" })
  const body = await res.json().catch(() => null)
  return res.ok && body?.data ? (body.data as T[]) : []
}

/**
 * Inventory ledger hook backed by the API (replaces the old localStorage ledger).
 * Presents the same `StockTransaction` shape the UI expects, in business-key
 * space (componentId = genericPN, brandId = brand slug) so it matches useData().
 * A balances lookup resolves (genericPN|brandSlug) → variantId/locationId for POSTs.
 */
export function useStockLedger(): StockLedger {
  const [transactions, setTransactions] = React.useState<StockTransaction[]>([])
  const [hydrated, setHydrated] = React.useState(false)
  const variantMap = React.useRef(new Map<string, { variantId: string; locationId: string }>())

  const load = React.useCallback(async () => {
    try {
      const balances = await getData<BalanceRow>("/api/inventory")
      const vm = new Map<string, { variantId: string; locationId: string }>()
      for (const b of balances) vm.set(`${b.genericPN}|${b.brandSlug}`, { variantId: b.variantId, locationId: b.locationId })
      variantMap.current = vm

      const ledger = await getData<LedgerRowDTO>("/api/inventory/transactions?limit=1000")
      setTransactions(
        ledger.map((l) => ({
          id: l.id,
          componentId: l.genericPN,
          brandId: l.brandSlug,
          supplierId: undefined,
          direction: l.qtyDelta >= 0 ? ("in" as const) : ("out" as const),
          qty: Math.abs(l.qtyDelta),
          date: l.createdAt,
          note: l.note ?? undefined,
        })),
      )
    } finally {
      setHydrated(true)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const addTransaction = React.useCallback(
    async (input: NewTransactionInput): Promise<MoveResult> => {
      const loc = variantMap.current.get(`${input.componentId}|${input.brandId}`)
      if (!loc) {
        return { ok: false, error: "No stock record for that component/brand — can't move an unstocked variant." }
      }
      const res = await fetch("/api/inventory/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: input.direction === "in" ? "IN" : "OUT",
          variantId: loc.variantId,
          locationId: loc.locationId,
          qty: input.qty,
          note: input.note || undefined,
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) return { ok: false, error: body?.error?.message ?? "Move failed" }
      await load()
      return { ok: true }
    },
    [load],
  )

  return { transactions, addTransaction, hydrated }
}
