// Purchase records — dev-only seed fixtures for scripts/seed-purchases.ts.
// IDs reference the component/brand/supplier seed arrays by business key.

export interface PurchaseOrder {
  poId: string
  prId: string
  componentName: string
  brandName: string
  supplierName: string
  qty: number
  totalCost: string
  status: "Sent" | "Dispatched" | "Completed"
  date: string
}

export const PURCHASE_ORDERS: PurchaseOrder[] = [
  {
    poId: "PO-984302",
    prId: "PR-728109",
    componentName: "Resistor 10K",
    brandName: "Yageo",
    supplierName: "ABC Electronics",
    qty: 5000,
    totalCost: "₹4,000.00",
    status: "Completed",
    date: "2026-06-20",
  },
  {
    poId: "PO-102948",
    prId: "PR-392048",
    componentName: "Capacitor 100uF",
    brandName: "Murata",
    supplierName: "XYZ Components",
    qty: 1000,
    totalCost: "₹1,450.00",
    status: "Dispatched",
    date: "2026-06-21",
  },
]

export interface PurchaseRequest {
  prId: string
  componentId: string
  componentName: string
  brandId: string
  brandName: string
  supplierId: string
  supplierName: string
  qty: number
  totalCost: string
  status: "Draft" | "Pending Approval" | "Sent" | "Approved"
  date: string
}

export const PURCHASE_REQUESTS: PurchaseRequest[] = [
  {
    prId: "PR-849201",
    componentId: "led-green",
    componentName: "LED Green",
    brandId: "everlight",
    brandName: "Everlight",
    supplierId: "led-depot",
    supplierName: "LED Depot",
    qty: 200,
    totalCost: "₹440.00",
    status: "Pending Approval",
    date: "2026-06-22",
  },
  {
    prId: "PR-392048",
    componentId: "capacitor-100uf",
    componentName: "Capacitor 100uF",
    brandId: "nichicon",
    brandName: "Nichicon",
    supplierId: "powertech",
    supplierName: "PowerTech",
    qty: 1000,
    totalCost: "₹1,500.00",
    status: "Approved",
    date: "2026-06-21",
  },
  {
    prId: "PR-728109",
    componentId: "resistor-10k",
    componentName: "Resistor 10K",
    brandId: "yageo",
    brandName: "Yageo",
    supplierId: "abc-electronics",
    supplierName: "ABC Electronics",
    qty: 5000,
    totalCost: "₹4,000.00",
    status: "Approved",
    date: "2026-06-20",
  },
]
