// Production-floor datasets. Readiness/planner panels derive from the active
// store via buildProductionData(); the order records (kanban) are static.
// Component lookups key on genericPN so ids resolve in BOTH mock and DB modes.
import type { Selectors } from "./selectors"

export interface ProductionOrder {
  id: string
  product: string
  qty: number
  status: "Draft" | "Ready" | "In Progress" | "Completed"
}

export const PRODUCTION_ORDERS: ProductionOrder[] = [
  { id: "PO-001", product: "ROIP 400", qty: 100, status: "Ready" },
  { id: "PO-002", product: "Voice Logger", qty: 20, status: "Draft" },
  { id: "PO-003", product: "ROIP 400", qty: 50, status: "Completed" },
  { id: "PO-004", product: "Voice Logger", qty: 10, status: "In Progress" },
]

export interface ReadinessItem {
  component: string
  required: number
  available: number
  status: boolean
}
export interface ShortageSupplier {
  brand: string
  brandId: string
  supplierId: string
  supplierName: string
  price: string
  leadTime: string
}
export interface PlannerShortage {
  item: string
  brand: string
  missing: number
}
export interface ProductionData {
  READINESS_ITEMS: ReadinessItem[]
  READINESS_SHORT_COMPONENT: string
  /** genericPN of the shorted component (for PR creation against the API). */
  READINESS_SHORT_PN: string
  READINESS_MISSING_QTY: number
  READINESS_SOURCING: ShortageSupplier[]
  PLANNER_SHORTAGES: PlannerShortage[]
}

// Simulated ROIP 400 batch demand, keyed by genericPN.
const READINESS_SPEC = [
  { pn: "RES-10K", required: 15000 },
  { pn: "CAP-100UF", required: 1000 },
  { pn: "LED-GRN", required: 700 },
]
const PLANNER_SPEC = [
  { pn: "AUD-CDC", missing: 50 },
  { pn: "LED-GRN", missing: 200 },
]

export function buildProductionData(d: Selectors): ProductionData {
  const byPN = (pn: string) => d.COMPONENTS.find((c) => c.genericPN === pn)

  const READINESS_ITEMS: ReadinessItem[] = READINESS_SPEC.map(({ pn, required }) => {
    const c = byPN(pn)
    const available = c?.stock ?? 0
    return { component: c?.name ?? pn, required, available, status: available >= required }
  })

  const shorted = READINESS_ITEMS.find((i) => !i.status)
  const shortedSpec = READINESS_SPEC.find((s) => (byPN(s.pn)?.name ?? s.pn) === shorted?.component)
  const READINESS_SHORT_COMPONENT = shorted?.component ?? "—"
  const READINESS_SHORT_PN = shortedSpec?.pn ?? ""
  const READINESS_MISSING_QTY = shorted ? shorted.required - shorted.available : 0

  const PLANNER_SHORTAGES: PlannerShortage[] = PLANNER_SPEC.map(({ pn, missing }) => {
    const c = byPN(pn)
    return {
      item: c?.name ?? pn,
      brand: c && c.brandVariants[0] ? d.getBrandName(c.brandVariants[0].brandId) : "—",
      missing,
    }
  })

  const READINESS_SOURCING: ShortageSupplier[] = (() => {
    const comp = shortedSpec ? byPN(shortedSpec.pn) : undefined
    if (!comp) return []
    return comp.offers.map((o) => ({
      brand: d.getBrandName(o.brandId),
      brandId: o.brandId,
      supplierId: o.supplierId,
      supplierName: d.getSupplierName(o.supplierId),
      price: d.formatINR(o.price),
      leadTime: d.formatLeadTime(o.leadTimeDays),
    }))
  })()

  return {
    READINESS_ITEMS,
    READINESS_SHORT_COMPONENT,
    READINESS_SHORT_PN,
    READINESS_MISSING_QTY,
    READINESS_SOURCING,
    PLANNER_SHORTAGES,
  }
}
