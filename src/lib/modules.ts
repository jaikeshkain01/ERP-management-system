import { Boxes, Layers, ShoppingCart, Factory, BarChart3, Nut, Package, Cpu, Truck } from "lucide-react"

export type ModuleId = "inventory" | "bom" | "purchasing" | "production" | "reports"

export type ModuleDef = {
  id: ModuleId
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  /** Entry page opened when the module is launched from the home screen. */
  href: string
  /** Route prefixes owned by this module. Matched on exact path or path + "/" boundary. */
  routePrefixes: string[]
}

export const MODULES: ModuleDef[] = [
  {
    id: "inventory",
    label: "Inventory & Stock",
    description: "Live stock levels, valuation and usage analysis.",
    icon: Boxes,
    href: "/components/inventory",
    routePrefixes: ["/components/inventory", "/components/usage"],
  },
  {
    id: "bom",
    label: "BOM / Structure Editor",
    description: "Product and PCB structure (BOM) editing.",
    icon: Layers,
    href: "/products/structure",
    routePrefixes: ["/products/structure", "/pcb-management/structure"],
  },
  {
    id: "purchasing",
    label: "Purchasing",
    description: "Purchase requests and purchase orders.",
    icon: ShoppingCart,
    href: "/purchases/requests",
    routePrefixes: ["/purchases"],
  },
  {
    id: "production",
    label: "Production",
    description: "MRP planner, readiness audit and production orders.",
    icon: Factory,
    href: "/production/planner",
    routePrefixes: ["/production"],
  },
  {
    id: "reports",
    label: "Reports & Analytics",
    description: "Cross-module analytics and exports.",
    icon: BarChart3,
    href: "/reports",
    routePrefixes: ["/reports"],
  },
]

/** Free base-tier areas — always available, shown alongside modules on the home launcher. */
export const BASE_AREAS: Array<{
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  href: string
}> = [
  { label: "Components", description: "Raw parts catalog and datasheets.", icon: Nut, href: "/components/list" },
  { label: "Products", description: "Finished goods catalog.", icon: Package, href: "/products/list" },
  { label: "PCB Management", description: "Board variations library.", icon: Cpu, href: "/pcb-management/list" },
  { label: "Suppliers & Brands", description: "Vendor and manufacturer masters.", icon: Truck, href: "/suppliers/list" },
]

export const DEFAULT_ENABLED: Record<ModuleId, boolean> = {
  inventory: true,
  bom: true,
  purchasing: true,
  production: true,
  reports: true,
}

export const MODULES_STORAGE_KEY = "mockup2_erp_enabled_modules"

// Longest prefix first so a module route nested under another module's prefix
// (none today, but possible) resolves to the more specific module.
const PREFIX_TO_MODULE: Array<{ prefix: string; id: ModuleId }> = MODULES.flatMap(
  (m) => m.routePrefixes.map((prefix) => ({ prefix, id: m.id }))
).sort((a, b) => b.prefix.length - a.prefix.length)

/** Returns the module owning this path, or null for free/base routes. */
export function moduleForPath(pathname: string): ModuleId | null {
  for (const { prefix, id } of PREFIX_TO_MODULE) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return id
  }
  return null
}
