import type { Selectors } from "./selectors"
import { PRODUCTION_BLOCKERS, PURCHASE_SUMMARY } from "./dashboard"

export type WorkspaceStat = {
  value: string
  label: string
  tone?: "danger" | "warning" | "default"
}

/** One headline stat per workspace id, derived from the active store (mockdata or DB). */
export function buildWorkspaceStats(d: Selectors): Record<string, WorkspaceStat> {
  const lowStockCount = d.COMPONENTS.filter((c) => d.componentStockStatus(c) !== "Healthy").length
  return {
    dashboard: { value: "Live", label: "operational overview" },
    components: { value: String(d.COMPONENTS.length), label: "components in catalog" },
    inventory: { value: String(lowStockCount), label: "parts below minimum", tone: "warning" },
    products: { value: String(d.PRODUCTS.length), label: "finished products" },
    pcb: { value: String(d.PCBS.length), label: "board designs" },
    production: { value: String(PRODUCTION_BLOCKERS.length), label: "blocked batches", tone: "danger" },
    purchasing: { value: String(PURCHASE_SUMMARY[0]?.value ?? 0), label: "pending requests" },
    suppliers: { value: `${d.SUPPLIERS.length}/${d.BRANDS.length}`, label: "suppliers / brands" },
    reports: { value: "—", label: "analytics & exports" },
  }
}
