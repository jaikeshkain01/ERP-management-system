"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  Cpu,
  LayoutDashboard,
  Nut,
  Package,
  Boxes,
  ChevronRight,
  Settings,
  Factory,
  Truck,
  ShoppingCart,
  Search,
  LogOut,
  Circle,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

type NavItem = {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
  items?: Array<{ title: string; url: string }>
}

type NavigationGroup = {
  label: string
  items: NavItem[]
}

// --- Navigation data, ordered by operational sequence ---
const navigationGroups: NavigationGroup[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Reports", url: "/reports", icon: BarChart3 },
    ],
  },
  {
    label: "Supply Chain",
    items: [
      {
        title: "Products",
        url: "/products",
        icon: Package,
        items: [
          { title: "Product List", url: "/products/list" },
          { title: "Product Structure", url: "/products/structure" },
        ],
      },
      {
        title: "PCB Management",
        url: "/pcb-management",
        icon: Cpu,
        items: [
          { title: "PCB List", url: "/pcb-management/list" },
          { title: "PCB Structure", url: "/pcb-management/structure" },
        ],
      },
      {
        title: "Components",
        url: "/components",
        icon: Nut,
        items: [
          { title: "Component List", url: "/components/list" },
          { title: "Component Details", url: "/components/details" },
        ],
      },
      {
        title: "Inventory",
        url: "/components/inventory",
        icon: Boxes,
        items: [
          { title: "Inventory", url: "/components/inventory" },
          { title: "Usage Analysis", url: "/components/usage" },
        ],
      },
    ],
  },
  {
    label: "Manufacturing",
    items: [
      {
        title: "Production",
        url: "/production",
        icon: Factory,
        items: [
          { title: "Production Planner", url: "/production/planner" },
          { title: "Production Readiness", url: "/production/readiness" },
          { title: "Production Orders", url: "/production/orders" },
        ],
      },
    ],
  },
  {
    label: "Procurement",
    items: [
      {
        title: "Suppliers & Brands",
        url: "/suppliers",
        icon: Truck,
        items: [
          { title: "Supplier List", url: "/suppliers/list" },
          { title: "Supplier Details", url: "/suppliers/details" },
          { title: "Brand List", url: "/brands/list" },
        ],
      },
      {
        title: "Purchase",
        url: "/purchases",
        icon: ShoppingCart,
        items: [
          { title: "Purchase Requests", url: "/purchases/requests" },
          { title: "Purchase Orders", url: "/purchases/orders" },
        ],
      },
    ],
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const [searchQuery, setSearchQuery] = React.useState("")

  // Helper to determine if a route or any of its sub-routes is active
  const isItemActive = (item: NavItem) => {
    if (pathname === item.url) return true
    if (item.items) {
      return item.items.some((subItem) => pathname === subItem.url)
    }
    return false
  }

  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>({})

  // Sync open sections based on active pathname
  React.useEffect(() => {
    setOpenSections((prev) => {
      const nextOpen = { ...prev }
      let changed = false
      navigationGroups.forEach((group) => {
        group.items.forEach((item) => {
          if (item.items && isItemActive(item)) {
            if (!nextOpen[item.title]) {
              nextOpen[item.title] = true
              changed = true
            }
          }
        })
      })
      return changed ? nextOpen : prev
    })
  }, [pathname])

  // Filter navigation items based on search query
  const filteredGroups = React.useMemo(() => {
    if (!searchQuery.trim()) return navigationGroups
    const q = searchQuery.toLowerCase()
    return navigationGroups
      .map((group) => {
        const filteredItems = group.items.filter((item) => {
          if (item.title.toLowerCase().includes(q)) return true
          if (item.items) {
            return item.items.some((sub) => sub.title.toLowerCase().includes(q))
          }
          return false
        })
        return { ...group, items: filteredItems }
      })
      .filter((group) => group.items.length > 0)
  }, [searchQuery])

  return (
    <Sidebar {...props}>
      {/* --- Header with logo --- */}
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/8 ring-1 ring-white/10 overflow-hidden">
            <Image
              src="/images/logo-square.png"
              alt="StackIOT Logo"
              width={100}
              height={100}
              className="object-contain p-1"
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold leading-tight tracking-tight text-white text-[13px] truncate">StackIOT Technologies</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-white/45 font-medium truncate">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
              Enterprise Suite · Online
            </span>
          </div>
        </div>
      </SidebarHeader>

      {/* --- Search input --- */}
      <div className="px-4 pt-4 pb-1">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/35 pointer-events-none" />
          <input
            type="text"
            placeholder="Search menu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 rounded-lg bg-white/8 border border-white/10 pl-8 pr-3 text-xs text-white/90 placeholder:text-white/30 outline-none focus:bg-white/12 focus:border-white/20 focus:ring-1 focus:ring-white/15 transition-all duration-200"
          />
        </div>
      </div>

      {/* --- Navigation groups (sequenced) --- */}
      <SidebarContent className="px-3 py-2 sidebar-scroll">
        {filteredGroups.map((group) => {
          return (
            <SidebarGroup key={group.label} className="py-1">
              <SidebarGroupLabel className="px-2 mb-1 h-auto">
                <div className="flex w-full items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">{group.label}</span>
                  <span className="ml-1 h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                </div>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon
                    const hasSubItems = !!item.items
                    const active = isItemActive(item)

                    if (hasSubItems) {
                      return (
                        <Collapsible
                          key={item.title}
                          open={!!openSections[item.title]}
                          onOpenChange={(isOpen) => {
                            setOpenSections((prev) => ({ ...prev, [item.title]: isOpen }))
                          }}
                          className="group/collapsible"
                        >
                          <SidebarMenuItem>
                            <CollapsibleTrigger
                              render={
                                <SidebarMenuButton
                                  isActive={active}
                                  tooltip={item.title}
                                  className={`relative w-full justify-between h-9 text-[13px] rounded-lg pl-3 transition-colors before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:transition-all ${
                                    active
                                      ? "bg-white/10 text-white font-semibold before:bg-primary"
                                      : "text-white/70 hover:bg-white/5 hover:text-white before:bg-transparent"
                                  }`}
                                />
                              }
                            >
                              <span className="flex items-center gap-2.5">
                                <Icon className={`h-4 w-4 ${active ? "text-primary" : "opacity-70"}`} />
                                <span>{item.title}</span>
                              </span>
                              <ChevronRight className="h-3.5 w-3.5 opacity-40 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <SidebarMenuSub className="ml-[19px] mt-0.5 border-l border-white/8 pl-3 space-y-0">
                                {item.items?.map((subItem) => {
                                  const subActive = pathname === subItem.url
                                  return (
                                    <SidebarMenuSubItem key={subItem.title}>
                                      <SidebarMenuSubButton
                                        isActive={subActive}
                                        render={<Link href={subItem.url} />}
                                        className="h-7 text-xs rounded-md hover:bg-white/5"
                                      >
                                        <span className={`flex items-center gap-2 ${subActive ? "text-white font-medium" : "text-white/55"}`}>
                                          <Circle className={`h-1.5 w-1.5 ${subActive ? "fill-primary text-primary" : "fill-white/20 text-white/20"}`} />
                                          {subItem.title}
                                        </span>
                                      </SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                  )
                                })}
                              </SidebarMenuSub>
                            </CollapsibleContent>
                          </SidebarMenuItem>
                        </Collapsible>
                      )
                    }

                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          isActive={active}
                          tooltip={item.title}
                          render={<Link href={item.url} />}
                          className={`relative h-9 text-[13px] rounded-lg pl-3 transition-colors before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:transition-all ${
                            active
                              ? "bg-white/10 text-white font-semibold before:bg-primary"
                              : "text-white/70 hover:bg-white/5 hover:text-white before:bg-transparent"
                          }`}
                        >
                          <Icon className={`h-4 w-4 ${active ? "text-primary" : "opacity-70"}`} />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        })}

        {/* Empty search state */}
        {filteredGroups.length === 0 && searchQuery.trim() && (
          <div className="flex flex-col items-center justify-center py-8 text-white/30">
            <Search className="h-8 w-8 mb-2 opacity-40" />
            <span className="text-xs font-medium">No results found</span>
            <span className="text-[10px] mt-0.5">Try a different search term</span>
          </div>
        )}
      </SidebarContent>

      {/* --- Footer --- */}
      <SidebarFooter className="border-t border-white/10 p-3 gap-2">
        {/* Settings quick link */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname === "/settings"}
              tooltip="Settings"
              render={<Link href="/settings" />}
              className={`h-9 text-[13px] rounded-lg pl-3 transition-colors ${
                pathname === "/settings"
                  ? "bg-white/10 text-white font-semibold"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Settings className={`h-4 w-4 ${pathname === "/settings" ? "text-primary" : "opacity-70"}`} />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* User card */}
        <div className="flex items-center gap-2.5 rounded-xl bg-white/5 ring-1 ring-white/10 px-2.5 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-white text-xs font-bold ring-1 ring-white/10">
            JW
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-[13px] font-semibold leading-none text-white truncate">Jaikesh Work</span>
            <span className="text-[10px] text-white/45 truncate mt-1">Administrator</span>
          </div>
          <button
            type="button"
            aria-label="Sign out"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/45 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
