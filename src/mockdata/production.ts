// Production-floor datasets. Component availability and sourcing options are
// linked to the central component store; order records are kept here.
import { getComponent, getBrandName, getSupplierName, formatINR, formatLeadTime } from "./index"

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

// ----- Readiness audit (simulated ROIP 400 batch) -----
export interface ReadinessItem {
  component: string
  required: number
  available: number
  status: boolean
}

const READINESS_SPEC: { id: string; required: number }[] = [
  { id: "resistor-10k", required: 15000 },
  { id: "capacitor-100uf", required: 1000 },
  { id: "led-green", required: 700 },
]

export const READINESS_ITEMS: ReadinessItem[] = READINESS_SPEC.map(({ id, required }) => {
  const available = getComponent(id)?.stock ?? 0
  return { component: getComponent(id)?.name ?? id, required, available, status: available >= required }
})

// The single shorted component drives the sourcing panel.
const shorted = READINESS_ITEMS.find((i) => !i.status)
const shortedSpec = READINESS_SPEC.find((s) => (getComponent(s.id)?.name ?? s.id) === shorted?.component)
export const READINESS_SHORT_COMPONENT = shorted?.component ?? "—"
export const READINESS_MISSING_QTY = shorted ? shorted.required - shorted.available : 0

export interface ShortageSupplier {
  brand: string
  supplierId: string
  supplierName: string
  price: string
  leadTime: string
}

// MRP shortage summary for the planner (item + primary brand, linked).
export interface PlannerShortage {
  item: string
  brand: string
  missing: number
}
export const PLANNER_SHORTAGES: PlannerShortage[] = [
  { id: "audio-codec", missing: 50 },
  { id: "led-green", missing: 200 },
].map(({ id, missing }) => {
  const c = getComponent(id)
  return {
    item: c?.name ?? id,
    brand: c ? getBrandName(c.brandVariants[0].brandId) : "—",
    missing,
  }
})

export const READINESS_SOURCING: ShortageSupplier[] = (() => {
  const comp = shortedSpec ? getComponent(shortedSpec.id) : undefined
  if (!comp) return []
  return comp.offers.map((o) => ({
    brand: getBrandName(o.brandId),
    supplierId: o.supplierId,
    supplierName: getSupplierName(o.supplierId),
    price: formatINR(o.price),
    leadTime: formatLeadTime(o.leadTimeDays),
  }))
})()
