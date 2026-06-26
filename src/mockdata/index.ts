// ============================================================================
//  Centralized mock data — single source of truth for the whole app.
//
//  Raw entities live in their own files (components, brands, suppliers, pcbs,
//  products). Everything is linked by id. The selectors below join those
//  entities so each page can derive exactly what it needs without duplicating
//  data. Import from "@/mockdata".
// ============================================================================

import { COMPONENTS } from "./components"
import { BRANDS } from "./brands"
import { SUPPLIERS } from "./suppliers"
import { PCBS } from "./pcbs"
import { PRODUCTS } from "./products"
import type {
  Component,
  Brand,
  Supplier,
  Pcb,
  Product,
  ComponentOffer,
  StockStatus,
} from "./types"

export * from "./types"
export { COMPONENTS } from "./components"
export { BRANDS } from "./brands"
export { SUPPLIERS } from "./suppliers"
export { PCBS } from "./pcbs"
export { PRODUCTS } from "./products"

// ----- Lookup maps -----
const componentById = new Map(COMPONENTS.map((c) => [c.id, c]))
const brandById = new Map(BRANDS.map((b) => [b.id, b]))
const supplierById = new Map(SUPPLIERS.map((s) => [s.id, s]))
const pcbById = new Map(PCBS.map((p) => [p.id, p]))
const productById = new Map(PRODUCTS.map((p) => [p.id, p]))

export const getComponent = (id: string): Component | undefined => componentById.get(id)
export const getBrand = (id: string): Brand | undefined => brandById.get(id)
export const getSupplier = (id: string): Supplier | undefined => supplierById.get(id)
export const getPcb = (id: string): Pcb | undefined => pcbById.get(id)
export const getProduct = (id: string): Product | undefined => productById.get(id)

export const getBrandName = (id: string): string => brandById.get(id)?.name ?? id
export const getSupplierName = (id: string): string => supplierById.get(id)?.name ?? id

// ----- Formatting helpers (data is stored as numbers; format at the edge) -----
export const formatINR = (n: number, decimals = 2): string =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

export const formatLeadTime = (days: number): string => `${days} Day${days === 1 ? "" : "s"}`

// ----- Component-level selectors -----
export const cheapestOffer = (c: Component): ComponentOffer | null =>
  c.offers.length ? c.offers.reduce((a, b) => (b.price < a.price ? b : a)) : null

export const bestPrice = (c: Component): number => cheapestOffer(c)?.price ?? 0

export const fastestOffer = (c: Component): ComponentOffer | null =>
  c.offers.length ? c.offers.reduce((a, b) => (b.leadTimeDays < a.leadTimeDays ? b : a)) : null

/** Distinct suppliers that carry this component. */
export const componentSupplierIds = (c: Component): string[] =>
  Array.from(new Set(c.offers.map((o) => o.supplierId)))

export const isSingleSupplier = (c: Component): boolean => componentSupplierIds(c).length <= 1

export const componentBrandIds = (c: Component): string[] =>
  Array.from(new Set(c.brandVariants.map((v) => v.brandId)))

export const componentStockStatus = (c: Component): StockStatus => {
  if (c.stock <= c.minStock * 0.5) return "Critical"
  if (c.stock < c.minStock) return "Low"
  return "Healthy"
}

/** Inventory value of a component at its best unit price. */
export const componentStockValue = (c: Component): number => c.stock * bestPrice(c)

// ----- PCB-level selectors -----
export interface PcbBomLine {
  component: Component
  qty: number
}

/** Resolve a PCB's BOM lines to full component records. */
export const pcbBom = (pcb: Pcb): PcbBomLine[] =>
  pcb.lines
    .map((l) => {
      const component = getComponent(l.componentId)
      return component ? { component, qty: l.qty } : null
    })
    .filter((x): x is PcbBomLine => x !== null)

/** Total component instances on one board. */
export const pcbTotalParts = (pcb: Pcb): number => pcb.lines.reduce((s, l) => s + l.qty, 0)

/** BOM cost of one board at best unit prices. */
export const pcbBomValue = (pcb: Pcb): number =>
  pcbBom(pcb).reduce((s, { component, qty }) => s + bestPrice(component) * qty, 0)

/** Products that include a given PCB. */
export const productsUsingPcb = (pcbId: string): Product[] =>
  PRODUCTS.filter((p) => p.pcbIds.includes(pcbId))

/** Short product code labels a PCB is used in (for compact "Used In" badges). */
export const pcbUsedInLabels = (pcbId: string): string[] =>
  productsUsingPcb(pcbId).map((p) => p.code)

// ----- Product-level selectors -----
export const productPcbs = (product: Product): Pcb[] =>
  product.pcbIds.map((id) => getPcb(id)).filter((p): p is Pcb => p !== undefined)

export interface ProductBomLine {
  pcb: Pcb
  component: Component
  qty: number
}

/** Flattened product → PCB → component BOM. */
export const productBom = (product: Product): ProductBomLine[] =>
  productPcbs(product).flatMap((pcb) =>
    pcbBom(pcb).map(({ component, qty }) => ({ pcb, component, qty })),
  )

/** Distinct components used anywhere in a product. */
export const productUniqueComponents = (product: Product): Component[] => {
  const ids = new Set(productBom(product).map((l) => l.component.id))
  return Array.from(ids).map((id) => getComponent(id)!).filter(Boolean)
}

export const productTotalParts = (product: Product): number =>
  productBom(product).reduce((s, l) => s + l.qty, 0)

export const productBrandCount = (product: Product): number => {
  const brandIds = new Set<string>()
  productUniqueComponents(product).forEach((c) =>
    componentBrandIds(c).forEach((b) => brandIds.add(b)),
  )
  return brandIds.size
}

export const productEstimatedCost = (product: Product): number =>
  productBom(product).reduce((s, l) => s + bestPrice(l.component) * l.qty, 0)

// ----- Cross-entity usage (where-used) -----
export interface ComponentUsagePair {
  product: Product
  pcb: Pcb
  qty: number
}

/** Every product/PCB pair that consumes a component, with per-board qty. */
export const componentUsage = (componentId: string): ComponentUsagePair[] => {
  const pairs: ComponentUsagePair[] = []
  for (const product of PRODUCTS) {
    for (const pcb of productPcbs(product)) {
      const line = pcb.lines.find((l) => l.componentId === componentId)
      if (line) pairs.push({ product, pcb, qty: line.qty })
    }
  }
  return pairs
}

/** Distinct products a component appears in. */
export const productsUsingComponent = (componentId: string): Product[] => {
  const seen = new Set<string>()
  const out: Product[] = []
  for (const { product } of componentUsage(componentId)) {
    if (!seen.has(product.id)) {
      seen.add(product.id)
      out.push(product)
    }
  }
  return out
}

/** Distinct PCBs a component appears in. */
export const pcbsUsingComponent = (componentId: string): Pcb[] => {
  const seen = new Set<string>()
  const out: Pcb[] = []
  for (const { pcb } of componentUsage(componentId)) {
    if (!seen.has(pcb.id)) {
      seen.add(pcb.id)
      out.push(pcb)
    }
  }
  return out
}

/** Brands that carry a component, as full Brand records. */
export const componentBrands = (c: Component): Brand[] =>
  componentBrandIds(c).map((id) => getBrand(id)).filter((b): b is Brand => b !== undefined)

/** Components a brand manufactures (reverse of brandVariants). */
export const brandComponents = (brandId: string): Component[] =>
  COMPONENTS.filter((c) => c.brandVariants.some((v) => v.brandId === brandId))

/** Components a supplier offers. */
export const supplierComponents = (supplierId: string): Component[] =>
  COMPONENTS.filter((c) => c.offers.some((o) => o.supplierId === supplierId))

/** Brands a supplier offers (across all its component offers). */
export const supplierBrandIds = (supplierId: string): string[] => {
  const ids = new Set<string>()
  COMPONENTS.forEach((c) =>
    c.offers.filter((o) => o.supplierId === supplierId).forEach((o) => ids.add(o.brandId)),
  )
  return Array.from(ids)
}
