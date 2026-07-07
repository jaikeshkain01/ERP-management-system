import { COMPONENTS, PRODUCTS, PCBS, SUPPLIERS, BRANDS } from "@/mockdata"
import { PRODUCTION_BLOCKERS, LOW_STOCK, PURCHASE_SUMMARY } from "@/mockdata/dashboard"

export type WorkspaceStat = {
  value: string
  label: string
  tone?: "danger" | "warning" | "default"
}

/** One headline stat per workspace id, derived from mock data (never hardcoded numbers). */
export const WORKSPACE_STATS: Record<string, WorkspaceStat> = {
  dashboard: { value: "Live", label: "operational overview" },
  components: { value: String(COMPONENTS.length), label: "components in catalog" },
  inventory: { value: String(LOW_STOCK.length), label: "parts below minimum", tone: "warning" },
  products: { value: String(PRODUCTS.length), label: "finished products" },
  pcb: { value: String(PCBS.length), label: "board designs" },
  production: { value: String(PRODUCTION_BLOCKERS.length), label: "blocked batches", tone: "danger" },
  purchasing: { value: String(PURCHASE_SUMMARY[0]?.value ?? 0), label: "pending requests" },
  suppliers: { value: `${SUPPLIERS.length}/${BRANDS.length}`, label: "suppliers / brands" },
  reports: { value: "—", label: "analytics & exports" },
}
