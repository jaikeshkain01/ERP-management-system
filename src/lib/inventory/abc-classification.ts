/**
 * ABC (Pareto) classification for inventory items.
 *
 * The classical inventory-management lens: rank items by stock value
 * descending, walk the cumulative share of total value, and split into
 *   A = "vital few"     → the items until cumulative reaches 80% of value
 *   B = "important many" → 80–95%
 *   C = "trivial many"  → the rest
 * A-items are where controls, cycle counts, and safety stock investment go.
 * C-items are candidates for coarser controls (order-up-to-max, longer
 * review cycles, or obsolescence review).
 *
 * Kept pure and client-side: computed from whatever item list is on hand
 * so the same lens works on filtered views without a round-trip. Items
 * with zero stock value (never received, or fully consumed) don't count
 * toward the totals and land in a dedicated "unclassified" bucket — an
 * A-tier chip on a zero-value item would be nonsense.
 */

export type AbcTier = "A" | "B" | "C" | "unclassified"

export interface AbcInput {
  id: string
  /** Stock value = on-hand × unit cost (already precomputed on ItemView). */
  stockValue: number
}

export interface AbcThresholds {
  /** Cumulative value share at which A ends. Default 0.80 (80%). */
  aCutoff?: number
  /** Cumulative value share at which B ends. Default 0.95 (95%). */
  bCutoff?: number
}

/**
 * Classify every input item into A / B / C / unclassified.
 * Returns a Map keyed by item id so callers can `map.get(item.id)` cheaply.
 *
 * Items with `stockValue <= 0` are always `unclassified` — they contribute
 * neither to the total nor to the cumulative walk, so ordering them doesn't
 * matter and A/B/C wouldn't be meaningful.
 */
export function classifyAbc(
  items: readonly AbcInput[],
  thresholds: AbcThresholds = {},
): Map<string, AbcTier> {
  const aCutoff = thresholds.aCutoff ?? 0.80
  const bCutoff = thresholds.bCutoff ?? 0.95

  const out = new Map<string, AbcTier>()
  const valued = items.filter((i) => i.stockValue > 0)
  const zero = items.filter((i) => !(i.stockValue > 0))
  zero.forEach((i) => out.set(i.id, "unclassified"))

  const total = valued.reduce((s, i) => s + i.stockValue, 0)
  if (total <= 0 || valued.length === 0) return out

  // Sort a shallow copy — never mutate the caller's array order.
  const sorted = [...valued].sort((a, b) => b.stockValue - a.stockValue)

  let cumulative = 0
  for (const item of sorted) {
    cumulative += item.stockValue
    const share = cumulative / total
    const tier: AbcTier =
      share <= aCutoff ? "A" :
      share <= bCutoff ? "B" :
      "C"
    out.set(item.id, tier)
  }
  return out
}

/** Aggregate counts + value share per tier, for a small summary strip. */
export interface AbcSummary {
  tier: AbcTier
  count: number
  totalValue: number
  valueShare: number
}

export function summarizeAbc(
  items: readonly AbcInput[],
  tiers: Map<string, AbcTier>,
): AbcSummary[] {
  const grandTotal = items.reduce((s, i) => s + Math.max(0, i.stockValue), 0)
  const buckets: Record<AbcTier, AbcSummary> = {
    A: { tier: "A", count: 0, totalValue: 0, valueShare: 0 },
    B: { tier: "B", count: 0, totalValue: 0, valueShare: 0 },
    C: { tier: "C", count: 0, totalValue: 0, valueShare: 0 },
    unclassified: { tier: "unclassified", count: 0, totalValue: 0, valueShare: 0 },
  }
  for (const item of items) {
    const tier = tiers.get(item.id) ?? "unclassified"
    buckets[tier].count += 1
    buckets[tier].totalValue += Math.max(0, item.stockValue)
  }
  for (const bucket of Object.values(buckets)) {
    bucket.valueShare = grandTotal > 0 ? bucket.totalValue / grandTotal : 0
  }
  return [buckets.A, buckets.B, buckets.C, buckets.unclassified]
}
