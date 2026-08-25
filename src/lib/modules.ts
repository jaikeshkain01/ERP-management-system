import { Boxes, Layers, ShoppingCart, Factory, BarChart3, Nut, Package, Cpu, Truck, LayoutDashboard } from "lucide-react"

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
  { label: "Items", description: "Every item — parts, sub-assemblies, products, assets.", icon: Nut, href: "/items/list" },
  { label: "Assembled Products", description: "Assembled items + sellable finished goods.", icon: Package, href: "/products/list" },
  { label: "Semi-assembled", description: "PCB revisions and sub-assemblies.", icon: Cpu, href: "/pcb-management/list" },
  { label: "Suppliers & Manufacturers", description: "Vendor and manufacturer masters.", icon: Truck, href: "/suppliers/list" },
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

// --- Workspaces: hub-and-spoke navigation (launchpad tiles, switcher, tab bar) ---

export type WorkspaceTab = {
  title: string
  href: string
  /** When set, this tab hides while the module is disabled (e.g. BOM structure tabs). */
  moduleId?: ModuleId
}

export type Workspace = {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  /** When set, the whole workspace locks while the module is disabled. */
  moduleId?: ModuleId
  /** Entry link (first tab or single page). */
  href: string
  /** Empty array = single-page workspace (no tab bar rendered). */
  tabs: WorkspaceTab[]
}

export const WORKSPACES: Workspace[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    href: "/dashboard",
    tabs: [],
  },
  {
    id: "components",
    label: "Items",
    icon: Nut,
    href: "/items/list",
    tabs: [
      // Item List + Add Item point at the universal /items/* pages.
      // The old "Item Details" tab was redundant — the list has a detail
      // panel that opens on row click. Direct links to /components/details
      // still resolve for now (rich legacy page); a proper /items/details
      // cutover is a later slice (see project_transformation_plan).
      { title: "Item List", href: "/items/list" },
      { title: "Add Item", href: "/items/add" },
    ],
  },
  {
    id: "inventory",
    label: "Inventory & Stock",
    icon: Boxes,
    moduleId: "inventory",
    href: "/components/inventory",
    tabs: [
      { title: "Inventory", href: "/components/inventory" },
      { title: "Warehouses", href: "/components/inventory/warehouses" },
      { title: "Usage Analysis", href: "/components/usage" },
    ],
  },
  // Both workspaces are now single-page — the "Structure" tabs were dropped
  // in the module-consolidation slice because /products/structure and
  // /pcb-management/structure just server-redirect to the per-item BOM
  // editor (F6.4 / B4). Keeping them as tabs would bounce the user out of
  // the workspace mid-flow. Access the BOM from each card instead.
  {
    id: "products",
    label: "Assembled Products",
    icon: Package,
    href: "/products/list",
    tabs: [],
  },
  {
    id: "pcb",
    label: "Semi-assembled",
    icon: Cpu,
    href: "/pcb-management/list",
    tabs: [],
  },
  {
    id: "production",
    label: "Production",
    icon: Factory,
    moduleId: "production",
    href: "/production/planner",
    tabs: [
      { title: "Planner", href: "/production/planner" },
      { title: "Readiness", href: "/production/readiness" },
      { title: "Orders", href: "/production/orders" },
    ],
  },
  {
    id: "purchasing",
    label: "Purchasing",
    icon: ShoppingCart,
    moduleId: "purchasing",
    href: "/purchases/requests",
    tabs: [
      { title: "Requests", href: "/purchases/requests" },
      { title: "Orders", href: "/purchases/orders" },
    ],
  },
  {
    id: "suppliers",
    label: "Suppliers & Manufacturers",
    icon: Truck,
    href: "/suppliers/list",
    tabs: [
      { title: "Suppliers", href: "/suppliers/list" },
      { title: "Supplier Details", href: "/suppliers/details" },
      { title: "Manufacturers", href: "/brands/list" },
    ],
  },
  {
    id: "reports",
    label: "Reports & Analytics",
    icon: BarChart3,
    moduleId: "reports",
    href: "/reports",
    tabs: [],
  },
]

// All (workspace, tab) pairs, most-specific href first, so /components/inventory
// resolves to the Inventory workspace while /items/list resolves to Items.
const WORKSPACE_TAB_INDEX: Array<{ href: string; workspace: Workspace }> = WORKSPACES.flatMap(
  (w) => w.tabs.map((t) => ({ href: t.href, workspace: w })),
).sort((a, b) => b.href.length - a.href.length)

function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/")
}

/** Look up a workspace by its id. Null if the id isn't a known workspace. */
export function workspaceById(id: string | null | undefined): Workspace | null {
  if (!id) return null
  return WORKSPACES.find((w) => w.id === id) ?? null
}

/**
 * A workspace is "reachable" when the caller has the license for it. Non-module
 * workspaces are always reachable. Use this before honouring a `?from=` origin
 * hint or rendering a link into a workspace — a locked origin should degrade
 * gracefully rather than surface tabs / Back buttons that dead-end at the lock
 * screen.
 */
export function isWorkspaceReachable(
  workspace: Workspace | null | undefined,
  isEnabled: (id: ModuleId) => boolean,
): boolean {
  if (!workspace) return false
  return !workspace.moduleId || isEnabled(workspace.moduleId)
}

/** Resolves the workspace a path belongs to, or null (home, settings, unknown). */
export function workspaceForPath(pathname: string): Workspace | null {
  for (const { href, workspace } of WORKSPACE_TAB_INDEX) {
    if (pathMatchesPrefix(pathname, href)) return workspace
  }
  // Fallback for single-page workspaces and entry hrefs (e.g. /reports, /purchases redirect).
  const byHref = [...WORKSPACES].sort((a, b) => b.href.length - a.href.length)
  for (const w of byHref) {
    if (pathMatchesPrefix(pathname, w.href)) return w
  }
  return null
}

/** The href of the tab matching this path (exact first, then prefix), or null. */
export function activeTabHref(workspace: Workspace, pathname: string): string | null {
  const exact = workspace.tabs.find((t) => t.href === pathname)
  if (exact) return exact.href
  const prefixed = [...workspace.tabs]
    .sort((a, b) => b.href.length - a.href.length)
    .find((t) => pathMatchesPrefix(pathname, t.href))
  return prefixed?.href ?? null
}
