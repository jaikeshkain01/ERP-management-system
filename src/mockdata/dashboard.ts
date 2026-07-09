// Dashboard panel datasets — entity-linked panels are derived from the active
// store via buildDashboardData(); presentational/log panels are static exports.
import type { Selectors } from "./selectors"
import type { ProductStatus, StockStatus } from "./types"

export interface ProductStatusItem {
  product: string
  status: ProductStatus
  buildableQty: number
}
export interface LowStockItem {
  component: string
  current: number
  minimum: number
  status: StockStatus
}
export interface SingleSupplierItem {
  component: string
  supplier: string
}
export interface ConsumedComponent {
  component: string
  monthlyUsage: string
}
export interface UsageImpactItem {
  component: string
  usedInProducts: number
}
export interface DashboardData {
  PRODUCT_STATUS: ProductStatusItem[]
  LOW_STOCK: LowStockItem[]
  SINGLE_SUPPLIER: SingleSupplierItem[]
  TOP_CONSUMED: ConsumedComponent[]
  USAGE_IMPACT: UsageImpactItem[]
  INVENTORY_CHART: { name: string; value: number; color: string }[]
}

/** Catalog-derived dashboard panels, bound to the active store (mockdata or DB). */
export function buildDashboardData(d: Selectors): DashboardData {
  const PRODUCT_STATUS: ProductStatusItem[] = d.PRODUCTS.map((p) => ({
    product: p.name,
    status: p.status,
    buildableQty: p.buildableQty,
  }))

  const LOW_STOCK: LowStockItem[] = d.COMPONENTS.filter(
    (c) => d.componentStockStatus(c) !== "Healthy",
  ).map((c) => ({
    component: c.name,
    current: c.stock,
    minimum: c.minStock,
    status: d.componentStockStatus(c),
  }))

  const SINGLE_SUPPLIER: SingleSupplierItem[] = d.COMPONENTS.filter(d.isSingleSupplier)
    .map((c) => {
      const offer = d.cheapestOffer(c)
      return { component: c.name, supplier: offer ? d.getSupplierName(offer.supplierId) : "—" }
    })
    .slice(0, 6)

  const TOP_CONSUMED: ConsumedComponent[] = [...d.COMPONENTS]
    .sort((a, b) => b.annualConsumption - a.annualConsumption)
    .slice(0, 3)
    .map((c) => ({ component: c.name, monthlyUsage: Math.round(c.annualConsumption / 12).toLocaleString() }))

  const USAGE_IMPACT: UsageImpactItem[] = d.COMPONENTS.map((c) => ({
    component: c.name,
    usedInProducts: d.productsUsingComponent(c.id).length,
  }))
    .sort((a, b) => b.usedInProducts - a.usedInProducts)
    .slice(0, 3)

  const INVENTORY_CHART = [
    { name: "Components", value: d.COMPONENTS.length, color: "#875A7B" },
    { name: "PCBs", value: d.PCBS.length, color: "#28C76F" },
    { name: "Products", value: d.PRODUCTS.length, color: "#FF9F43" },
  ]

  return { PRODUCT_STATUS, LOW_STOCK, SINGLE_SUPPLIER, TOP_CONSUMED, USAGE_IMPACT, INVENTORY_CHART }
}

// ----- Presentational / log panels (not derivable from catalog entities) -----
export interface BlockerItem {
  product: string
  missingComp: string
  qty: number
}
export const PRODUCTION_BLOCKERS: BlockerItem[] = [
  { product: "ROIP 400", missingComp: "LED Green", qty: 500 },
  { product: "Voice Logger", missingComp: "Audio Codec", qty: 25 },
]

export interface DashProductionOrder {
  orderId: string
  product: string
  qty: number
  status: "In Progress" | "Completed" | "Draft"
}
export const PRODUCTION_ORDERS_RECENT: DashProductionOrder[] = [
  { orderId: "PROD-001", product: "ROIP 400", qty: 100, status: "In Progress" },
  { orderId: "PROD-002", product: "Voice Logger", qty: 50, status: "Completed" },
]

export const PURCHASE_SUMMARY = [
  { title: "Pending PRs", value: 12, desc: "Awaiting manager approval" },
  { title: "Open POs", value: 8, desc: "Shipment agreements in transit" },
  { title: "Expected Deliveries", value: 5, desc: "Due within next 7 days" },
]

export interface ActivityItem {
  text: string
  time: string
}
export const RECENT_ACTIVITIES: ActivityItem[] = [
  { text: "ABC Electronics added as preferred supplier for Resistor 10K", time: "10 mins ago" },
  { text: "Purchase Order PO-104 created and sent to XYZ Components", time: "1 hour ago" },
  { text: "ROIP 400 engineering BOM structure updated", time: "3 hours ago" },
  { text: "100 units of Audio PCB produced and transferred to stock", time: "5 hours ago" },
  { text: "Voice Logger production batch PROD-002 completed successfully", time: "1 day ago" },
]
