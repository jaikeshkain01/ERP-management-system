import type { Selectors } from "@/lib/catalog"

export type WorkspaceStat = {
  value: string
  label: string
  tone?: "danger" | "warning" | "default"
}

/** One headline stat per workspace id, derived from the live catalog store. */
export function buildWorkspaceStats(d: Selectors): Record<string, WorkspaceStat> {
  const lowStockCount = d.COMPONENTS.filter((c) => d.componentStockStatus(c) !== "Healthy").length
  const blockedProducts = d.PRODUCTS.filter((p) => p.status === "Blocked").length
  return {
    dashboard: { value: "Live", label: "operational overview" },
    components: { value: String(d.COMPONENTS.length), label: "components in catalog" },
    inventory: { value: String(lowStockCount), label: "parts below minimum", tone: "warning" },
    products: { value: String(d.PRODUCTS.length), label: "finished products" },
    pcb: { value: String(d.PCBS.length), label: "board designs" },
    production: { value: String(blockedProducts), label: "blocked products", tone: "danger" },
    purchasing: { value: "—", label: "purchase requests" },
    suppliers: { value: `${d.SUPPLIERS.length}/${d.BRANDS.length}`, label: "suppliers / brands" },
    reports: { value: "—", label: "analytics & exports" },
  }
}
