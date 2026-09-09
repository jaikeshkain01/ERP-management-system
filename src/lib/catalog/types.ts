// ============================================================================
//  Shared domain types for the catalog. These are the canonical entity shapes
//  that flow through /api/bootstrap → the selector factory → every page.
// ============================================================================

export type StockStatus = "Healthy" | "Low" | "Critical"
export type SolderType = "SMD" | "DIP"

/** Item type — drives behaviour (raw is bought, finished is shipped, …). */
export type ItemType = "raw" | "sub_assembly" | "finished_product" | "consumable" | "asset" | "packaging"

/** Workflow stage for per-piece tracking. */
export type ItemStage =
  | "under_production"
  | "production_complete"
  | "untested"
  | "testing"
  | "tested"
  | "faulty"
  | "finished"

/** Source kind is derived from item type — no longer user-selectable.
 *  raw / consumable / asset / packaging → purchased
 *  sub_assembly / finished_product     → manufactured */
export type ItemSourceKind = "purchased" | "manufactured"

export function sourceKindForItemType(t: ItemType): ItemSourceKind {
  return t === "sub_assembly" || t === "finished_product" ? "manufactured" : "purchased"
}

export function defaultStageForItemType(t: ItemType): ItemStage {
  return t === "sub_assembly" || t === "finished_product" ? "under_production" : "untested"
}

/** A node in the tenant's item-category tree (Phase 2A). `id` is the category uuid. */
export interface ItemCategory {
  id: string
  parentId: string | null
  name: string
  slug: string
  path: string
  defaultItemType: ItemType | null
  sortOrder: number
}

export interface Spec {
  key: string
  value: string
}

/** A manufacturer-specific variant of a generic component. */
export interface ComponentBrandVariant {
  /** The variant uuid (needed for variant edit/delete APIs). Absent in mock mode. */
  id?: string
  brandId: string
  partNo: string
  stock: number
}

/** A supplier price offer for a specific brand variant of a component. */
export interface ComponentOffer {
  supplierId: string
  brandId: string
  price: number // INR
  leadTimeDays: number
}

export interface Component {
  id: string
  genericPN: string
  name: string
  category: string
  /** Category tree node (uuid) this item belongs to, and its materialised path. */
  categoryId: string | null
  categoryPath: string | null
  /** Item type (raw/sub_assembly/finished_product/consumable/asset/packaging). */
  itemType: ItemType
  description: string
  stock: number
  minStock: number
  reorderQty: number
  unit: string
  bin: string
  lastCount: string
  solderType: SolderType
  footprint: string
  spq: number
  annualConsumption: number
  specs: Spec[]
  brandVariants: ComponentBrandVariant[]
  offers: ComponentOffer[]
  /** User-chosen preferred supplier (supplier slug/id). Undefined ⇒ derive cheapest. */
  preferredSupplierId?: string
}

/** Direction of a stock movement in the inventory ledger. */
export type StockDirection = "in" | "out"

/**
 * A single stock movement. Current stock is the running sum of these
 * (perpetual inventory): `in` adds, `out` subtracts. Each move is tagged with
 * the brand variant it applies to; stock-in also records the sourcing supplier.
 */
export interface StockTransaction {
  id: string
  componentId: string
  brandId: string
  supplierId?: string
  direction: StockDirection
  qty: number // always positive; direction gives the sign
  date: string // ISO string
  note?: string
  lotNo?: string
}

export interface Brand {
  id: string
  name: string
  description: string
  headquarter: string
  founded: string
  status: "Approved" | "Pending" | "Inactive"
  rating: number
}

export interface Supplier {
  id: string
  name: string
  description: string
  contact: string
  email: string
  phone: string
  address: string
  terms: string
  rating: number
  status: "Active" | "Inactive"
}

export type PcbStatus = "Active" | "Prototype" | "Deprecated"

/** A bill-of-materials line: a component used on a PCB with a per-board qty. */
export interface PcbLine {
  componentId: string
  qty: number
  /** Board reference designators for the placements, e.g. "R1-R20", "C1-C10", "U1". */
  refDes?: string
  /** Preferred manufacturer brand for this placement (→ Brand). */
  preferredBrandId?: string
  remarks?: string
}

export interface Pcb {
  id: string
  name: string
  description: string
  layers: number
  status: PcbStatus
  /** Headline BOM line count shown in lists (may exceed unique lines). */
  componentsCount: number
  /** Finished-board stock on hand. */
  stockCount: number
  lines: PcbLine[]
}

export type ProductStatus = "Ready" | "Blocked" | "Limited"

/** A PCB used by a product, with how many boards per finished unit. */
export interface ProductPcbRef {
  pcbId: string
  qty: number
  sequence?: number
  remarks?: string
}

export interface Product {
  id: string
  name: string
  code: string
  version: string
  description: string
  status: ProductStatus
  estimatedCost: number
  buildableQty: number
  pcbs: ProductPcbRef[]
}
