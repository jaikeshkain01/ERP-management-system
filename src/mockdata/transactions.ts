import { COMPONENTS } from "./components"
import type { StockTransaction } from "./types"

export const STOCK_TX_STORAGE_KEY = "mockup2_erp_stock_transactions"

// A few extra historical movements for demo flavour. The seed builder subtracts
// each move's net from that brand's opening balance so the per-brand total still
// equals the catalog variant stock (the ledger stays reconciled with the catalog).
type DemoMove = {
  componentId: string
  brandId: string
  supplierId?: string
  direction: "in" | "out"
  qty: number
  date: string
  note: string
}

const DEMO_EXTRA_MOVES: DemoMove[] = [
  { componentId: "resistor-10k", brandId: "yageo", supplierId: "xyz-components", direction: "in", qty: 3000, date: "2026-06-20", note: "Restock PO-1042" },
  { componentId: "resistor-10k", brandId: "yageo", direction: "out", qty: 1500, date: "2026-06-28", note: "Issued to ROIP 400 build" },
  { componentId: "capacitor-100uf", brandId: "nichicon", supplierId: "powertech", direction: "in", qty: 1000, date: "2026-06-22", note: "Restock PO-1051" },
  { componentId: "capacitor-100uf", brandId: "rubycon", direction: "out", qty: 500, date: "2026-06-30", note: "Issued to Voice Logger build" },
]

const signed = (m: { direction: "in" | "out"; qty: number }) => (m.direction === "in" ? m.qty : -m.qty)

/**
 * Deterministic starting ledger: one "Opening balance" entry per brand variant,
 * plus the demo moves above. Opening qty is reduced by the net of any demo moves
 * on the same component+brand, so `sum(transactions) === catalog stock` per brand
 * and in total. No `new Date()` / `Math.random()` here — SSR/hydration-safe.
 */
export function buildSeedTransactions(): StockTransaction[] {
  const txns: StockTransaction[] = []

  for (const c of COMPONENTS) {
    for (const v of c.brandVariants) {
      const extras = DEMO_EXTRA_MOVES.filter((m) => m.componentId === c.id && m.brandId === v.brandId)
      const extrasNet = extras.reduce((s, m) => s + signed(m), 0)
      const openingQty = v.stock - extrasNet

      const firstOffer = c.offers.find((o) => o.brandId === v.brandId)
      txns.push({
        id: `seed-${c.id}-${v.brandId}`,
        componentId: c.id,
        brandId: v.brandId,
        supplierId: firstOffer?.supplierId,
        direction: "in",
        qty: openingQty,
        date: c.lastCount,
        note: "Opening balance",
      })
    }
  }

  for (const m of DEMO_EXTRA_MOVES) {
    txns.push({
      id: `seed-extra-${m.componentId}-${m.brandId}-${m.date}`,
      componentId: m.componentId,
      brandId: m.brandId,
      supplierId: m.supplierId,
      direction: m.direction,
      qty: m.qty,
      date: m.date,
      note: m.note,
    })
  }

  return txns
}
