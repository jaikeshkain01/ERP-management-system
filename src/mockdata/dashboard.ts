// Dashboard panel datasets — entity-linked panels are derived from the central
// store; presentational/log panels are kept here so the page stays data-free.
import { PRODUCTS } from "./products"
import { PCBS } from "./pcbs"
import { COMPONENTS } from "./components"
import {
  getSupplierName, cheapestOffer, componentStockStatus, isSingleSupplier,
  productsUsingComponent,
} from "./index"
import type { ProductStatus, StockStatus } from "./types"

export interface ProductStatusItem {
  product: string
  status: ProductStatus
  buildableQty: number
}
export const PRODUCT_STATUS: ProductStatusItem[] = PRODUCTS.map((p) => ({
  product: p.name,
  status: p.status,
  buildableQty: p.buildableQty,
}))

export interface LowStockItem {
  component: string
  current: number
  minimum: number
  status: StockStatus
}
export const LOW_STOCK: LowStockItem[] = COMPONENTS.filter(
  (c) => componentStockStatus(c) !== "Healthy",
).map((c) => ({
  component: c.name,
  current: c.stock,
  minimum: c.minStock,
  status: componentStockStatus(c),
}))

export interface SingleSupplierItem {
  component: string
  supplier: string
}
export const SINGLE_SUPPLIER: SingleSupplierItem[] = COMPONENTS.filter(isSingleSupplier)
  .map((c) => {
    const offer = cheapestOffer(c)
    return { component: c.name, supplier: offer ? getSupplierName(offer.supplierId) : "—" }
  })
  .slice(0, 6)

export interface ConsumedComponent {
  component: string
  monthlyUsage: string
}
export const TOP_CONSUMED: ConsumedComponent[] = [...COMPONENTS]
  .sort((a, b) => b.annualConsumption - a.annualConsumption)
  .slice(0, 3)
  .map((c) => ({ component: c.name, monthlyUsage: Math.round(c.annualConsumption / 12).toLocaleString() }))

export interface UsageImpactItem {
  component: string
  usedInProducts: number
}
export const USAGE_IMPACT: UsageImpactItem[] = COMPONENTS.map((c) => ({
  component: c.name,
  usedInProducts: productsUsingComponent(c.id).length,
}))
  .sort((a, b) => b.usedInProducts - a.usedInProducts)
  .slice(0, 3)

// Inventory distribution chart — counts derived from the central store.
export const INVENTORY_CHART = [
  { name: "Components", value: COMPONENTS.length, color: "#875A7B" },
  { name: "PCBs", value: PCBS.length, color: "#28C76F" },
  { name: "Products", value: PRODUCTS.length, color: "#FF9F43" },
]

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
