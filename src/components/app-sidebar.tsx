"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Cpu,
  LayoutDashboard,
  Layers,
  Nut,
  Package,
  ChevronRight,
  ChevronDown,
  User,
  Settings,
  Factory,
  Truck,
  Award,
  ShoppingCart,
  Search,
  LogOut,
  Bell,
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
  SidebarSeparator,
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

type NavItem = {
  title: string
  url: string
  icon: React.ComponentType<any>
  items?: Array<{ title: string; url: string }>
}

type NavigationGroup = {
  label: string
  items: NavItem[]
}

// --- Navigation data grouped by category ---
const navigationGroups: NavigationGroup[] = [
  {
    label: "Overview",
    items: [
      {
        title: "Dashboard",
        url: "/",
        icon: LayoutDashboard,
      },
      {
        title: "Reports",
        url: "/reports",
        icon: BarChart3,
      },
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
          { title: "Usage Analysis", url: "/components/usage" },
          { title: "Inventory", url: "/components/inventory" },
        ],
      },
      {
        title: "Brands",
        url: "/brands",
        icon: Award,
        items: [
          { title: "Brand List", url: "/brands/list" },
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
        title: "Suppliers",
        url: "/suppliers",
        icon: Truck,
        items: [
          { title: "Supplier List", url: "/suppliers/list" },
          { title: "Supplier Details", url: "/suppliers/details" },
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
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg overflow-hidden">
            <Image
              src="/images/logo-square.png"
              alt="StackIOT Logo"
              width={100}
              height={100}
              className="object-contain"
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold leading-tight tracking-tight text-white text-[13px] truncate">StackIOT Technologies</span>
            <span className="text-[10px] text-white/45 mt-0.5 font-medium truncate">Pvt. Ltd. · Enterprise Suite</span>
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

      {/* --- Navigation groups --- */}
      <SidebarContent className="px-3 py-2 sidebar-scroll">
        {filteredGroups.map((group, groupIndex) => (
          <React.Fragment key={group.label}>
            {groupIndex > 0 && (
              <div className="mx-2 my-1.5">
                <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              </div>
            )}
            <SidebarGroup className="py-1">
              <SidebarGroupLabel className="px-3 mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white/50">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
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
                                  className="w-full justify-between h-8 text-[13px] rounded-lg"
                                />
                              }
                            >
                              <span className="flex items-center gap-2.5">
                                <Icon className="h-4 w-4 opacity-70" />
                                <span>{item.title}</span>
                              </span>
                              <ChevronRight className="h-3.5 w-3.5 opacity-40 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <SidebarMenuSub className="ml-[18px] mt-0.5 border-l border-white/8 pl-3 space-y-0">
                                {item.items?.map((subItem) => {
                                  const subActive = pathname === subItem.url
                                  return (
                                    <SidebarMenuSubItem key={subItem.title}>
                                      <SidebarMenuSubButton
                                        isActive={subActive}
                                        render={<Link href={subItem.url} />}
                                        className="h-7 text-xs rounded-md"
                                      >
                                        <span className={`flex items-center gap-2 ${subActive ? 'text-white font-medium' : 'text-white/55'}`}>
                                          <Circle className={`h-1.5 w-1.5 ${subActive ? 'fill-white text-white' : 'fill-white/20 text-white/20'}`} />
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
                          className="h-8 text-[13px] rounded-lg"
                        >
                          <Icon className="h-4 w-4 opacity-70" />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </React.Fragment>
        ))}

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
      <SidebarFooter className="border-t border-white/10 p-3">
        {/* Settings quick link */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname === "/settings"}
              tooltip="Settings"
              render={<Link href="/settings" />}
              className="h-8 text-[13px] rounded-lg"
            >
              <Settings className="h-4 w-4 opacity-70" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Divider */}
        <div className="mx-1 my-1">
          <div className="h-px bg-white/8" />
        </div>

        {/* User */}
        <div className="flex items-center gap-3 px-2 py-1.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 ring-1 ring-white/10">
            <User className="h-3.5 w-3.5" />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-[13px] font-medium leading-none text-white truncate">Jaikesh Work</span>
            <span className="text-[10px] text-white/40 truncate mt-0.5">jaikesh@example.com</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
