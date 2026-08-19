"use client"

import * as React from "react"
import type { StockTransaction } from "@/lib/catalog"
import type { NewTransactionInput } from "@/lib/stock-ledger"

export type MoveResult = { ok: boolean; error?: string }

type StockLedger = {
  transactions: StockTransaction[]
  /**
   * Authoritative on-hand per component, keyed by genericPN, summed from the
   * DB's `inventory_balances` projection (never re-derived from the ledger,
   * which is fetched with a cap and would drift once it truncates).
   */
  onHandByComponent: Map<string, number>
  /** Authoritative on-hand per brand variant, keyed by `genericPN|brandSlug`. */
  onHandByVariant: Map<string, number>
  /** Append a movement to the real ledger (POST). Resolves to ok/error. */
  addTransaction: (input: NewTransactionInput) => Promise<MoveResult>
  hydrated: boolean
}

interface BalanceRow {
  genericPN: string
  brandSlug: string
  variantId: string
  locationId: string
  onHand: number
}
interface LedgerRowDTO {
  id: string
  genericPN: string
  brandSlug: string
  qtyDelta: number
  createdAt: string
  note: string | null
  lotNo: string | null
  supplierSlug: string | null
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
  const [onHandByComponent, setOnHandByComponent] = React.useState<Map<string, number>>(new Map())
  const [onHandByVariant, setOnHandByVariant] = React.useState<Map<string, number>>(new Map())
  const [hydrated, setHydrated] = React.useState(false)
  const variantMap = React.useRef(new Map<string, { variantId: string; locationId: string }>())

  const load = React.useCallback(async () => {
    try {
      const balances = await getData<BalanceRow>("/api/inventory")
      const vm = new Map<string, { variantId: string; locationId: string }>()
      const byComponent = new Map<string, number>()
      const byVariant = new Map<string, number>()
      for (const b of balances) {
        // A variant can have a balance row per storage location; sum them so the
        // component/variant total reflects on-hand across the whole warehouse set.
        vm.set(`${b.genericPN}|${b.brandSlug}`, { variantId: b.variantId, locationId: b.locationId })
        byComponent.set(b.genericPN, (byComponent.get(b.genericPN) ?? 0) + b.onHand)
        const vKey = `${b.genericPN}|${b.brandSlug}`
        byVariant.set(vKey, (byVariant.get(vKey) ?? 0) + b.onHand)
      }
      variantMap.current = vm
      setOnHandByComponent(byComponent)
      setOnHandByVariant(byVariant)

      // Ledger is used only for the transaction-history display, never for stock
      // totals — those come from the authoritative balances above.
      const ledger = await getData<LedgerRowDTO>("/api/inventory/transactions?limit=1000")
      setTransactions(
        ledger.map((l) => ({
          id: l.id,
          componentId: l.genericPN,
          brandId: l.brandSlug,
          supplierId: l.supplierSlug ?? undefined,
          direction: l.qtyDelta >= 0 ? ("in" as const) : ("out" as const),
          qty: Math.abs(l.qtyDelta),
          date: l.createdAt,
          note: l.note ?? undefined,
          lotNo: l.lotNo ?? undefined,
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
      const payload: Record<string, unknown> = {
        type: input.direction === "in" ? "IN" : "OUT",
        qty: input.qty,
        note: input.note || undefined,
        ...(input.direction === "in"
          ? { lotNo: input.lotNo || undefined, expiryDate: input.expiryDate || undefined, supplierSlug: input.supplierId || undefined }
          : {}),
      }
      if (loc) {
        payload.variantId = loc.variantId
        payload.locationId = loc.locationId
      } else {
        payload.genericPN = input.componentId
        payload.brandSlug = input.brandId
      }
      // An explicit destination bin (inbound picker) overrides the auto/existing
      // location; blank keeps the default-bin / existing-balance behaviour.
      if (input.direction === "in" && input.locationId) {
        payload.locationId = input.locationId
      }
      // Outbound overrides: pin to a specific lot (skips FEFO) or split across
      // multiple lots (overrides both `lotId` and FEFO — server writes one
      // ledger row per allocation).
      if (input.direction === "out" && input.lotAllocations?.length) {
        payload.lotAllocations = input.lotAllocations
      } else if (input.direction === "out" && input.lotId) {
        payload.lotId = input.lotId
      }

      const res = await fetch("/api/inventory/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) return { ok: false, error: body?.error?.message ?? "Move failed" }
      await load()
      return { ok: true }
    },
    [load],
  )

  return { transactions, onHandByComponent, onHandByVariant, addTransaction, hydrated }
}
