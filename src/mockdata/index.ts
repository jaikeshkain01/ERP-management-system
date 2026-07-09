// ============================================================================
//  Centralized mock data — the mock store. Raw entities live in their own files;
//  the selectors are the shared factory (./selectors) bound to the seed arrays.
//  The live backend store (src/lib/data-provider) binds the SAME factory to
//  /api/bootstrap, so pages behave identically on mockdata or the database.
//  Import from "@/mockdata".
// ============================================================================
import { COMPONENTS } from "./components"
import { BRANDS } from "./brands"
import { SUPPLIERS } from "./suppliers"
import { PCBS } from "./pcbs"
import { PRODUCTS } from "./products"
import { createSelectors } from "./selectors"

export * from "./types"
export { COMPONENTS } from "./components"
export { BRANDS } from "./brands"
export { SUPPLIERS } from "./suppliers"
export { PCBS } from "./pcbs"
export { PRODUCTS } from "./products"
export { formatINR, formatLeadTime, createSelectors } from "./selectors"
export type {
  DataSet,
  Selectors,
  PcbBomLine,
  ProductPcbEntry,
  ProductBomLine,
  ComponentUsagePair,
} from "./selectors"

// Selector suite bound to the mock seed arrays (backward-compatible public API).
const S = createSelectors({
  components: COMPONENTS,
  brands: BRANDS,
  suppliers: SUPPLIERS,
  pcbs: PCBS,
  products: PRODUCTS,
})

export const getComponent = S.getComponent
export const getBrand = S.getBrand
export const getSupplier = S.getSupplier
export const getPcb = S.getPcb
export const getProduct = S.getProduct
export const getBrandName = S.getBrandName
export const getSupplierName = S.getSupplierName

export const cheapestOffer = S.cheapestOffer
export const bestPrice = S.bestPrice
export const fastestOffer = S.fastestOffer
export const componentSupplierIds = S.componentSupplierIds
export const isSingleSupplier = S.isSingleSupplier
export const componentBrandIds = S.componentBrandIds
export const componentStockStatus = S.componentStockStatus
export const componentStockValue = S.componentStockValue

export const pcbBom = S.pcbBom
export const pcbTotalParts = S.pcbTotalParts
export const pcbBomValue = S.pcbBomValue
export const productsUsingPcb = S.productsUsingPcb
export const pcbUsedInLabels = S.pcbUsedInLabels

export const productPcbList = S.productPcbList
export const productPcbs = S.productPcbs
export const productBom = S.productBom
export const productUniqueComponents = S.productUniqueComponents
export const productTotalParts = S.productTotalParts
export const productBrandCount = S.productBrandCount
export const productEstimatedCost = S.productEstimatedCost

export const componentUsage = S.componentUsage
export const productsUsingComponent = S.productsUsingComponent
export const pcbsUsingComponent = S.pcbsUsingComponent
export const componentBrands = S.componentBrands
export const brandComponents = S.brandComponents
export const supplierComponents = S.supplierComponents
export const supplierBrandIds = S.supplierBrandIds
