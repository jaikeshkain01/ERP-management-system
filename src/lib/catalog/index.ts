// ============================================================================
//  Catalog domain layer. Shared entity types + the selector factory that the
//  frontend binds to /api/bootstrap (see src/lib/data-provider). Import from
//  "@/lib/catalog".
// ============================================================================
export * from "./types"
export { formatINR, formatLeadTime, createSelectors } from "./selectors"
export type {
  DataSet,
  Selectors,
  PcbBomLine,
  ProductPcbEntry,
  ProductBomLine,
  ComponentUsagePair,
} from "./selectors"
