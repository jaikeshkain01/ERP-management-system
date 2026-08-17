// ============================================================================
//  Selector factory — the derivation logic, bound to any dataset.
//  `createSelectors(data)` powers the live backend store (src/lib/data-provider,
//  bound to /api/bootstrap). Pages consume these selectors for all catalog
//  view-models.
// ============================================================================
import type {
  Component,
  Brand,
  Supplier,
  Pcb,
  Product,
  ComponentOffer,
  StockStatus,
  ItemCategory,
} from "./types"
import { stockHealth } from "@/lib/stock-status"

export interface DataSet {
  components: Component[]
  brands: Brand[]
  suppliers: Supplier[]
  pcbs: Pcb[]
  products: Product[]
  itemCategories: ItemCategory[]
}

export interface PcbBomLine {
  component: Component
  qty: number
  refDes?: string
  preferredBrandId?: string
  remarks?: string
}

export interface ProductPcbEntry {
  pcb: Pcb
  qty: number
  sequence: number
  remarks?: string
}

export interface ProductBomLine {
  pcb: Pcb
  component: Component
  qty: number
}

export interface ComponentUsagePair {
  product: Product
  pcb: Pcb
  qty: number
}

// ----- Formatting helpers (pure — no dataset needed) -----
export const formatINR = (n: number, decimals = 2): string =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

export const formatLeadTime = (days: number): string => `${days} Day${days === 1 ? "" : "s"}`

/** Build the full selector suite over `data`. Selectors reference each other via closure. */
export function createSelectors(data: DataSet) {
  const { components, brands, suppliers, pcbs, products, itemCategories = [] } = data

  const categoryById = new Map(itemCategories.map((c) => [c.id, c]))
  /** Direct children of a category (or roots when id is null), sorted for display. */
  const categoryChildren = (parentId: string | null): ItemCategory[] =>
    itemCategories
      .filter((c) => c.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  const getCategory = (id: string | null | undefined): ItemCategory | undefined =>
    id ? categoryById.get(id) : undefined

  const componentById = new Map(components.map((c) => [c.id, c]))
  const brandById = new Map(brands.map((b) => [b.id, b]))
  const supplierById = new Map(suppliers.map((s) => [s.id, s]))
  const pcbById = new Map(pcbs.map((p) => [p.id, p]))
  const productById = new Map(products.map((p) => [p.id, p]))

  const getComponent = (id: string): Component | undefined => componentById.get(id)
  const getBrand = (id: string): Brand | undefined => brandById.get(id)
  const getSupplier = (id: string): Supplier | undefined => supplierById.get(id)
  const getPcb = (id: string): Pcb | undefined => pcbById.get(id)
  const getProduct = (id: string): Product | undefined => productById.get(id)

  const getBrandName = (id: string): string => brandById.get(id)?.name ?? id
  const getSupplierName = (id: string): string => supplierById.get(id)?.name ?? id

  // ----- Component-level -----
  const cheapestOffer = (c: Component): ComponentOffer | null =>
    c.offers.length ? c.offers.reduce((a, b) => (b.price < a.price ? b : a)) : null
  const bestPrice = (c: Component): number => cheapestOffer(c)?.price ?? 0
  const fastestOffer = (c: Component): ComponentOffer | null =>
    c.offers.length ? c.offers.reduce((a, b) => (b.leadTimeDays < a.leadTimeDays ? b : a)) : null
  const componentSupplierIds = (c: Component): string[] =>
    Array.from(new Set(c.offers.map((o) => o.supplierId)))
  const isSingleSupplier = (c: Component): boolean => componentSupplierIds(c).length <= 1
  const componentBrandIds = (c: Component): string[] =>
    Array.from(new Set(c.brandVariants.map((v) => v.brandId)))
  const componentStockStatus = (c: Component): StockStatus => stockHealth(c.stock, c.minStock)
  const componentStockValue = (c: Component): number => c.stock * bestPrice(c)

  // ----- PCB-level -----
  const pcbBom = (pcb: Pcb): PcbBomLine[] =>
    pcb.lines
      .map((l): PcbBomLine | null => {
        const component = getComponent(l.componentId)
        return component
          ? { component, qty: l.qty, refDes: l.refDes, preferredBrandId: l.preferredBrandId, remarks: l.remarks }
          : null
      })
      .filter((x): x is PcbBomLine => x !== null)
  const pcbTotalParts = (pcb: Pcb): number => pcb.lines.reduce((s, l) => s + l.qty, 0)
  const pcbBomValue = (pcb: Pcb): number =>
    pcbBom(pcb).reduce((s, { component, qty }) => s + bestPrice(component) * qty, 0)
  const productsUsingPcb = (pcbId: string): Product[] =>
    products.filter((p) => p.pcbs.some((r) => r.pcbId === pcbId))
  const pcbUsedInLabels = (pcbId: string): string[] => productsUsingPcb(pcbId).map((p) => p.code)

  // ----- Product-level -----
  const productPcbList = (product: Product): ProductPcbEntry[] =>
    product.pcbs
      .map((ref): ProductPcbEntry | null => {
        const pcb = getPcb(ref.pcbId)
        return pcb ? { pcb, qty: ref.qty, sequence: ref.sequence ?? 0, remarks: ref.remarks } : null
      })
      .filter((e): e is ProductPcbEntry => e !== null)
      .sort((a, b) => a.sequence - b.sequence)
  const productPcbs = (product: Product): Pcb[] => productPcbList(product).map((e) => e.pcb)
  const productBom = (product: Product): ProductBomLine[] =>
    productPcbList(product).flatMap(({ pcb, qty: boardQty }) =>
      pcbBom(pcb).map(({ component, qty }) => ({ pcb, component, qty: qty * boardQty })),
    )
  const productUniqueComponents = (product: Product): Component[] => {
    const ids = new Set(productBom(product).map((l) => l.component.id))
    return Array.from(ids).map((id) => getComponent(id)!).filter(Boolean)
  }
  const productTotalParts = (product: Product): number =>
    productBom(product).reduce((s, l) => s + l.qty, 0)
  const productBrandCount = (product: Product): number => {
    const brandIds = new Set<string>()
    productUniqueComponents(product).forEach((c) => componentBrandIds(c).forEach((b) => brandIds.add(b)))
    return brandIds.size
  }
  const productEstimatedCost = (product: Product): number =>
    productBom(product).reduce((s, l) => s + bestPrice(l.component) * l.qty, 0)

  // ----- Cross-entity (where-used) -----
  const componentUsage = (componentId: string): ComponentUsagePair[] => {
    const pairs: ComponentUsagePair[] = []
    for (const product of products) {
      for (const pcb of productPcbs(product)) {
        const line = pcb.lines.find((l) => l.componentId === componentId)
        if (line) pairs.push({ product, pcb, qty: line.qty })
      }
    }
    return pairs
  }
  const productsUsingComponent = (componentId: string): Product[] => {
    const seen = new Set<string>()
    const out: Product[] = []
    for (const { product } of componentUsage(componentId)) {
      if (!seen.has(product.id)) { seen.add(product.id); out.push(product) }
    }
    return out
  }
  const pcbsUsingComponent = (componentId: string): Pcb[] => {
    const seen = new Set<string>()
    const out: Pcb[] = []
    for (const { pcb } of componentUsage(componentId)) {
      if (!seen.has(pcb.id)) { seen.add(pcb.id); out.push(pcb) }
    }
    return out
  }
  const componentBrands = (c: Component): Brand[] =>
    componentBrandIds(c).map((id) => getBrand(id)).filter((b): b is Brand => b !== undefined)
  const brandComponents = (brandId: string): Component[] =>
    components.filter((c) => c.brandVariants.some((v) => v.brandId === brandId))
  const supplierComponents = (supplierId: string): Component[] =>
    components.filter((c) => c.offers.some((o) => o.supplierId === supplierId))
  const supplierBrandIds = (supplierId: string): string[] => {
    const ids = new Set<string>()
    components.forEach((c) =>
      c.offers.filter((o) => o.supplierId === supplierId).forEach((o) => ids.add(o.brandId)),
    )
    return Array.from(ids)
  }

  return {
    // raw
    COMPONENTS: components, BRANDS: brands, SUPPLIERS: suppliers, PCBS: pcbs, PRODUCTS: products,
    ITEM_CATEGORIES: itemCategories,
    // lookups
    getComponent, getBrand, getSupplier, getPcb, getProduct, getBrandName, getSupplierName,
    getCategory, categoryChildren,
    // formatting (pure, re-exposed for convenience)
    formatINR, formatLeadTime,
    // component
    cheapestOffer, bestPrice, fastestOffer, componentSupplierIds, isSingleSupplier,
    componentBrandIds, componentStockStatus, componentStockValue,
    // pcb
    pcbBom, pcbTotalParts, pcbBomValue, productsUsingPcb, pcbUsedInLabels,
    // product
    productPcbList, productPcbs, productBom, productUniqueComponents, productTotalParts,
    productBrandCount, productEstimatedCost,
    // cross
    componentUsage, productsUsingComponent, pcbsUsingComponent, componentBrands,
    brandComponents, supplierComponents, supplierBrandIds,
  }
}

export type Selectors = ReturnType<typeof createSelectors>
