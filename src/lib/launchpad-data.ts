import type { Selectors } from "@/lib/catalog"

export type WorkspaceStat = {
  value: string
  label: string
  tone?: "danger" | "warning" | "default"
}

/**
 * One headline stat per workspace id, derived from the live catalog store.
 * `d.COMPONENTS` now sources from the universal `items` table (bootstrap
 * rewritten in this slice), so itemType filters partition all items — raw,
 * semi-assembled, assembled — without needing extra fetches.
 */
export function buildWorkspaceStats(d: Selectors): Record<string, WorkspaceStat> {
  const totalItems       = d.COMPONENTS.length
  const semiAssembledCnt = d.COMPONENTS.filter((c) => c.itemType === "semi_assembled").length
  const assembledCnt     = d.COMPONENTS.filter((c) => c.itemType === "assembled").length
  // Inventory scans only stock-carrying stages — assets and packaging skew
  // "below minimum" alerts since they rarely have a min set.
  const lowStockCnt      = d.COMPONENTS.filter((c) =>
    (c.itemType === "raw" || c.itemType === "consumable") && d.componentStockStatus(c) !== "Healthy",
  ).length
  return {
    dashboard: { value: "Live", label: "operational overview" },
    components: { value: String(totalItems), label: "items in catalog" },
    inventory: { value: String(lowStockCnt), label: "parts below minimum", tone: lowStockCnt > 0 ? "warning" : "default" },
    products: { value: String(assembledCnt), label: "assembled items" },
    pcb: { value: String(semiAssembledCnt), label: "semi-assembled items" },
    production: { value: "—", label: "orders in progress" },
    purchasing: { value: "—", label: "purchase requests" },
    suppliers: { value: `${d.SUPPLIERS.length}/${d.BRANDS.length}`, label: "suppliers / brands" },
    reports: { value: "—", label: "analytics & exports" },
  }
}
