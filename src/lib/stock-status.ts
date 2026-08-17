/**
 * Canonical stock-health classification — the SINGLE source of truth.
 *
 * Previously this threshold logic was copy-pasted in five places (server
 * `components.ts`, the catalog selector, the inventory page, the list page, and
 * again in the list's status text) with subtly different rules. Import from here
 * instead so every surface agrees.
 *
 * Health is derived from on-hand `stock` vs the safety/reorder point `minStock`.
 * A `minStock` of 0 means "no reorder point set" → anything in stock reads Healthy.
 */

/** Four-value status for surfaces that distinguish an empty bin from a critical one. */
export type StockStatus = "Healthy" | "Low" | "Critical" | "Out of Stock"

/** Three-value health for surfaces that don't call out "Out of Stock" separately. */
export type StockHealth = "Healthy" | "Low" | "Critical"

export function stockStatus(stock: number, minStock: number): StockStatus {
  if (stock <= 0) return "Out of Stock"
  if (stock <= minStock * 0.5) return "Critical"
  if (stock < minStock) return "Low"
  return "Healthy"
}

/** Same thresholds, but folds "Out of Stock" into "Critical". */
export function stockHealth(stock: number, minStock: number): StockHealth {
  const s = stockStatus(stock, minStock)
  return s === "Out of Stock" ? "Critical" : s
}
