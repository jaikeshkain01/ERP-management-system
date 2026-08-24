"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Search, X, Sparkles, Cpu, Package, Layers,
  Award, Landmark, CornerDownLeft, ShieldCheck,
  DollarSign, Activity, FileText, ArrowRight, Boxes, Lock
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  buildSearchData,
  SearchComponent, SearchProduct, SearchPCB, SearchBrand, SearchSupplier
} from "@/lib/search-data"
import { useData } from "@/lib/data-provider"
import { useModules } from "@/components/module-provider"

type SearchResultItem = 
  | { type: "component"; data: SearchComponent }
  | { type: "product"; data: SearchProduct }
  | { type: "pcb"; data: SearchPCB }
  | { type: "brand"; data: SearchBrand }
  | { type: "supplier"; data: SearchSupplier }

// Component for highlighting matching search text
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <span>{text}</span>
  
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return <span>{text}</span>
  
  // Escaping special characters for Regex
  const escapedTokens = tokens.map(t => t.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'))
  const regex = new RegExp(`(${escapedTokens.join('|')})`, 'gi')
  
  const parts = text.split(regex)
  
  return (
    <span>
      {parts.map((part, i) => 
        regex.test(part) ? (
          <mark key={i} className="bg-primary/20 dark:bg-primary/30 text-primary dark:text-primary-foreground font-bold px-0.5 rounded transition-all shadow-2xs">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </span>
  )
}

export function UniversalSearch() {
  const router = useRouter()
  const { isEnabled } = useModules()
  const d = useData()
  const {
    products: SEARCH_PRODUCTS,
    pcbs: SEARCH_PCBS,
    components: SEARCH_COMPONENTS,
    brands: SEARCH_BRANDS,
    suppliers: SEARCH_SUPPLIERS,
  } = React.useMemo(() => buildSearchData(d), [d])
  const [isOpen, setIsOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [activeTab, setActiveTab] = React.useState<"all" | "components" | "products" | "brands">("all")
  
  // Navigation states
  const [results, setResults] = React.useState<SearchResultItem[]>([])
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  // Popular searches default listing (defensive: data may be empty while loading)
  const POPULAR_SEARCHES: SearchResultItem[] = [
    SEARCH_PRODUCTS[0] && { type: "product" as const, data: SEARCH_PRODUCTS[0] },
    SEARCH_PCBS[0] && { type: "pcb" as const, data: SEARCH_PCBS[0] },
    SEARCH_COMPONENTS[0] && { type: "component" as const, data: SEARCH_COMPONENTS[0] },
    SEARCH_SUPPLIERS[0] && { type: "supplier" as const, data: SEARCH_SUPPLIERS[0] },
    SEARCH_BRANDS[0] && { type: "brand" as const, data: SEARCH_BRANDS[0] },
  ].filter(Boolean) as SearchResultItem[]

  // Listen for Ctrl+K global hotkey and Alt+1-4 tab switcher
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }

      if (isOpen && e.altKey) {
        if (e.key === "1") {
          e.preventDefault()
          setActiveTab("all")
        } else if (e.key === "2") {
          e.preventDefault()
          setActiveTab("components")
        } else if (e.key === "3") {
          e.preventDefault()
          setActiveTab("products")
        } else if (e.key === "4") {
          e.preventDefault()
          setActiveTab("brands")
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen])

  // Auto-focus input when opened
  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
      setSelectedIndex(0)
    } else {
      setQuery("")
    }
  }, [isOpen])

  // Perform smart search query filtering with all tokens matching
  React.useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setSelectedIndex(0)
      return
    }

    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
    const tempResults: SearchResultItem[] = []

    const matchesAllTokens = (targets: (string | undefined | null)[]) => {
      const flatTargets = targets
        .filter((t): t is string => typeof t === "string")
        .map(t => t.toLowerCase())
      
      return tokens.every(token => 
        flatTargets.some(target => target.includes(token))
      )
    }

    // 1. Search Products (by name, code, description, child PCBs)
    SEARCH_PRODUCTS.forEach(p => {
      const targets = [p.name, p.code, p.description, ...p.pcbs]
      if (matchesAllTokens(targets)) {
        tempResults.push({ type: "product", data: p })
      }
    })

    // 2. Search PCBs (by name, parent product, parent code, and component items)
    SEARCH_PCBS.forEach(pcb => {
      const targets = [
        pcb.name,
        pcb.productName,
        pcb.productCode,
        ...pcb.components.map(c => c.name),
        ...pcb.components.map(c => c.genericPN)
      ]
      if (matchesAllTokens(targets)) {
        tempResults.push({ type: "pcb", data: pcb })
      }
    })

    // 3. Search Components (by name, generic PN, category, brands name/partNo, supplier offerings, usedIn list)
    SEARCH_COMPONENTS.forEach(comp => {
      const brandNames = comp.brands.map(b => b.brand)
      const brandPartNos = comp.brands.map(b => b.partNo)
      const supplierNames = comp.suppliers.map(s => s.supplier)
      const targets = [
        comp.name,
        comp.genericPN,
        comp.category,
        ...brandNames,
        ...brandPartNos,
        ...supplierNames,
        ...(comp.usedIn || [])
      ]
      if (matchesAllTokens(targets)) {
        tempResults.push({ type: "component", data: comp })
      }
    })

    // 4. Search Brands (by name, component names, generic PN, partNo)
    SEARCH_BRANDS.forEach(b => {
      const targets = [
        b.name,
        ...b.components.map(c => c.name),
        ...b.components.map(c => c.genericPN),
        ...b.components.map(c => c.partNo)
      ]
      if (matchesAllTokens(targets)) {
        tempResults.push({ type: "brand", data: b })
      }
    })

    // 5. Search Suppliers (by name, offerings name, generic PN, brand)
    SEARCH_SUPPLIERS.forEach(s => {
      const targets = [
        s.name,
        ...s.components.map(c => c.name),
        ...s.components.map(c => c.genericPN),
        ...s.components.map(c => c.brand)
      ]
      if (matchesAllTokens(targets)) {
        tempResults.push({ type: "supplier", data: s })
      }
    })

    // Apply Tab Filtering
    let filtered = tempResults
    if (activeTab === "components") {
      filtered = tempResults.filter(r => r.type === "component")
    } else if (activeTab === "products") {
      filtered = tempResults.filter(r => r.type === "product" || r.type === "pcb")
    } else if (activeTab === "brands") {
      filtered = tempResults.filter(r => r.type === "brand" || r.type === "supplier")
    }

    setResults(filtered)
    setSelectedIndex(0)
  }, [query, activeTab])

  // Handle Keyboard Navigation within search list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % Math.max(results.length, 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + results.length) % Math.max(results.length, 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (results[selectedIndex]) {
        selectItem(results[selectedIndex])
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      setIsOpen(false)
    }
  }

  // Navigate/Route when result selected
  const selectItem = (item: SearchResultItem) => {
    setIsOpen(false)
    if (item.type === "component") {
      router.push(`/items/details/${item.data.id}`)
    } else if (item.type === "product") {
      // Structure pages belong to the BOM module — fall back to the base list when disabled
      router.push(isEnabled("bom") ? `/products/structure?product=${item.data.id}` : "/products/list")
    } else if (item.type === "pcb") {
      router.push(isEnabled("bom") ? `/pcb-management/structure?pcb=${item.data.id}` : "/pcb-management/list")
    } else if (item.type === "brand") {
      router.push(`/brands/list?brand=${item.data.name.toLowerCase().replace(/\s+/g, "-")}`)
    } else if (item.type === "supplier") {
      router.push(`/suppliers/details?supplier=${item.data.name.toLowerCase().replace(/\s+/g, "-")}`)
    }
  }

  /**
   * Cross-workspace jump: component result → Inventory page focused on that PN.
   * Only fires when the Inventory module is licensed (the caller checks
   * `isEnabled("inventory")`). The Inventory page reads `?item=<pn>` and
   * pre-fills its search so the user lands on the matching row.
   */
  const openInInventory = (genericPN: string) => {
    setIsOpen(false)
    router.push(`/components/inventory?item=${encodeURIComponent(genericPN)}`)
  }

  // Get currently selected item for right pane preview
  const selectedItem = results[selectedIndex] || null

  return (
    <>
      {/* Trigger Search Button in Navbar */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2.5 bg-white/[0.06] hover:bg-white/[0.11] border border-chrome-border rounded-md py-1.5 pl-3 pr-2 text-left w-64 md:w-80 transition-all select-none group hover:border-white/25"
      >
        <Search className="h-4 w-4 text-chrome-muted group-hover:text-chrome-strong transition-colors shrink-0" />
        <span className="text-xs text-chrome-muted truncate flex-1">Search Product, PCB, Item...</span>
        <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-chrome-border bg-white/[0.07] px-1.5 font-mono text-[9px] font-medium text-chrome-muted">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>      {/* Modern Search Overlay Modal */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-start justify-center p-4 pt-16 md:pt-24 animate-in fade-in duration-200"
          onClick={() => setIsOpen(false)}
        >
          <div 
            className="w-full max-w-5xl bg-card border border-border/80 rounded-2xl shadow-2xl flex flex-col h-[580px] max-h-[85vh] overflow-hidden scale-100 animate-in fade-in zoom-in-98 duration-200"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            {/* Search Header Bar */}
            <div className="flex items-center border-b border-border bg-muted/20 px-5 py-3.5 shrink-0">
              <Search className="h-5 w-5 text-primary mr-3 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type to search Products, PCBs, Items, Manufacturers, Suppliers..."
                className="w-full bg-transparent border-0 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 text-base"
              />
              {query && (
                <button 
                  type="button" 
                  onClick={() => setQuery("")}
                  className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground rounded-full mr-2"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <kbd className="inline-flex h-6 select-none items-center gap-0.5 rounded border border-border bg-muted px-2 font-mono text-[10px] text-muted-foreground">
                ESC
              </kbd>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-2 border-b border-border/60 bg-muted/5 px-5 py-2.5 shrink-0 overflow-x-auto">
              <button 
                type="button"
                onClick={() => setActiveTab("all")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${activeTab === "all" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
              >
                <span>All</span>
                <span className="text-[9px] opacity-75 font-mono">⌥1</span>
              </button>
              <button 
                type="button"
                onClick={() => setActiveTab("components")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${activeTab === "components" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
              >
                <span>Items</span>
                <span className="text-[9px] opacity-75 font-mono">⌥2</span>
              </button>
              <button 
                type="button"
                onClick={() => setActiveTab("products")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${activeTab === "products" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
              >
                <span>Products & PCBs</span>
                <span className="text-[9px] opacity-75 font-mono">⌥3</span>
              </button>
              <button 
                type="button"
                onClick={() => setActiveTab("brands")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${activeTab === "brands" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
              >
                <span>Manufacturers & Suppliers</span>
                <span className="text-[9px] opacity-75 font-mono">⌥4</span>
              </button>
            </div>

            {/* Split Content Panels */}
            {!query.trim() ? (
              <div className="flex-1 min-h-0 flex">
                {/* Left Pane: Quick Action Directory */}
                <div className="w-[35%] shrink-0 border-r border-border/60 overflow-y-auto p-6 space-y-6 bg-background">
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 mb-4 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Quick Navigation
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                      {isEnabled("production") && (
                      <button
                        onClick={() => { setIsOpen(false); router.push("/production/readiness") }}
                        className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/40 hover:border-primary/40 hover:bg-primary/5 hover:shadow-xs transition-all group text-left w-full"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-lg bg-background text-primary group-hover:scale-105 transition-transform border border-border/50">
                            <Cpu className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-foreground/90">Production Readiness</div>
                            <div className="text-[11px] text-muted-foreground mt-1">Check BOM status & stock readiness</div>
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </button>
                      )}

                      {isEnabled("production") && (
                      <button
                        onClick={() => { setIsOpen(false); router.push("/production/planner") }}
                        className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/40 hover:border-primary/40 hover:bg-primary/5 hover:shadow-xs transition-all group text-left w-full"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-lg bg-background text-primary group-hover:scale-105 transition-transform border border-border/50">
                            <Layers className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-foreground/90">Production Planner</div>
                            <div className="text-[11px] text-muted-foreground mt-1">Manage batches and order queuing</div>
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </button>
                      )}

                      {isEnabled("purchasing") && (
                      <button
                        onClick={() => { setIsOpen(false); router.push("/purchases/requests") }}
                        className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/40 hover:border-primary/40 hover:bg-primary/5 hover:shadow-xs transition-all group text-left w-full"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-lg bg-background text-primary group-hover:scale-105 transition-transform border border-border/50">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-foreground/90">Purchase Requests</div>
                            <div className="text-[11px] text-muted-foreground mt-1">Approve material and cost requisitions</div>
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 mb-3">Search Guidelines</h3>
                    <div className="p-4 rounded-xl bg-muted/20 border border-border/30 text-[11px] text-muted-foreground/90 space-y-2.5 leading-relaxed font-medium">
                      <p>💡 <span className="font-bold text-foreground">Multi-word search:</span> Search `resistor yageo` to find Resistors supplied by Yageo.</p>
                      <p>🔑 <span className="font-bold text-foreground">Part Numbers:</span> Search by generic PN (like `RES-10K`) or manufacturer part number (like `RC0402JR`).</p>
                      <p>🚀 <span className="font-bold text-foreground">Hotkeys:</span> Use <kbd className="bg-background px-1 py-0.2 rounded border border-border text-[9px] font-mono">Alt</kbd> + <kbd className="bg-background px-1 py-0.2 rounded border border-border text-[9px] font-mono">1-4</kbd> to switch tabs.</p>
                    </div>
                  </div>
                </div>

                {/* Right Pane: Popular Searches */}
                <div className="w-[65%] bg-muted/5 overflow-y-auto p-6 space-y-5">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-primary" />
                    Popular Searches
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    {POPULAR_SEARCHES.map((item, idx) => (
                      <div 
                        key={idx}
                        onClick={() => selectItem(item)}
                        className="flex items-center justify-between p-4 rounded-xl bg-background border border-border/40 hover:border-primary/30 hover:bg-primary/5 hover:shadow-xs transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="text-primary/70 group-hover:text-primary transition-colors shrink-0">
                            {item.type === "component" && <Cpu className="h-5 w-5" />}
                            {item.type === "product" && <Package className="h-5 w-5" />}
                            {item.type === "pcb" && <Layers className="h-5 w-5" />}
                            {item.type === "brand" && <Award className="h-5 w-5" />}
                            {item.type === "supplier" && <Landmark className="h-5 w-5" />}
                          </div>
                          <div className="min-w-0 flex flex-col text-left">
                            <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                              {item.data.name}
                            </span>
                            <span className="text-xs text-muted-foreground/80 font-mono truncate mt-1">
                              {item.type === "component" ? `Generic PN: ${item.data.genericPN}` : 
                               item.type === "product" ? `Code: ${item.data.code}` :
                               item.type === "pcb" ? `Product: ${item.data.productName}` :
                               item.type === "brand" ? `Manufacturer Profile` :
                               `Supplier Agreement`}
                            </span>
                          </div>
                        </div>
                        <span className={`text-[9.5px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full shrink-0 border ${
                          item.type === "component" ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400" :
                          item.type === "product" ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400" :
                          item.type === "pcb" ? "bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400" :
                          "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                        }`}>
                          {item.type}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex">
                {/* Left Pane: Result List */}
                <div className="w-[35%] shrink-0 border-r border-border/60 overflow-y-auto p-3 space-y-1.5 bg-background">
                  {results.length > 0 ? (
                    results.map((result, index) => {
                      const isSelected = index === selectedIndex
                      return (
                        <div 
                          key={`${result.type}-${index}`}
                          onClick={() => selectItem(result)}
                          onMouseEnter={() => setSelectedIndex(index)}
                          className={`flex items-center justify-between p-3.5 rounded-xl cursor-pointer transition-all border gap-3 ${
                            isSelected 
                              ? "bg-primary/10 border-primary/20 text-foreground font-semibold shadow-xs" 
                              : "bg-transparent border-transparent hover:bg-muted/30 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {result.type === "component" && <Cpu className={`h-4.5 w-4.5 shrink-0 ${isSelected ? "text-primary animate-pulse" : "text-muted-foreground/80"}`} />}
                            {result.type === "product" && <Package className={`h-4.5 w-4.5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground/80"}`} />}
                            {result.type === "pcb" && <Layers className={`h-4.5 w-4.5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground/80"}`} />}
                            {result.type === "brand" && <Award className={`h-4.5 w-4.5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground/80"}`} />}
                            {result.type === "supplier" && <Landmark className={`h-4.5 w-4.5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground/80"}`} />}

                            <div className="min-w-0 flex flex-col text-left">
                              <span className={`text-sm truncate ${isSelected ? "text-foreground font-bold" : "text-foreground font-medium"}`}>
                                <HighlightText text={
                                  result.type === "component" ? result.data.name : 
                                  result.type === "product" ? result.data.name :
                                  result.type === "pcb" ? result.data.name :
                                  result.type === "brand" ? result.data.name :
                                  result.data.name
                                } query={query} />
                              </span>
                              <span className="text-[11px] text-muted-foreground font-mono mt-1">
                                {result.type === "component" ? (
                                  <span>Generic: <HighlightText text={result.data.genericPN} query={query} /></span>
                                ) : result.type === "product" ? (
                                  <span>Code: <HighlightText text={result.data.code} query={query} /></span>
                                ) : result.type === "pcb" ? (
                                  <span>Product: <HighlightText text={result.data.productName} query={query} /></span>
                                ) : result.type === "brand" ? (
                                  <span>Manufacturer Profile</span>
                                ) : (
                                  <span>Supplier Offerings</span>
                                )}
                              </span>
                            </div>
                          </div>

                          {/* Category Badge */}
                          <span className={`text-[9px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full shrink-0 border ${
                            result.type === "component" ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400" :
                            result.type === "product" ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400" :
                            result.type === "pcb" ? "bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400" :
                            "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                          }`}>
                            {result.type}
                          </span>
                        </div>
                      )
                    })
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-6">
                      <Activity className="h-8 w-8 text-muted-foreground/50 mb-2 stroke-1" />
                      <p className="text-sm font-semibold">No results match your query</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Try another search string or filter tab.</p>
                    </div>
                  )}
                </div>

                {/* Right Pane: Detail Preview */}
                <div className="w-[65%] bg-muted/5 overflow-y-auto p-6 space-y-6">
                  {selectedItem ? (
                    <div className="space-y-6">
                      {/* Header */}
                      <div className="flex items-start justify-between border-b border-border/40 pb-4 gap-3">
                        <div className="text-left">
                          <h4 className="text-lg font-bold text-foreground tracking-tight">
                            <HighlightText text={
                              selectedItem.type === "component" ? selectedItem.data.name : 
                              selectedItem.type === "product" ? selectedItem.data.name :
                              selectedItem.type === "pcb" ? selectedItem.data.name :
                              selectedItem.type === "brand" ? selectedItem.data.name :
                              selectedItem.data.name
                            } query={query} />
                          </h4>
                          <span className="text-[10px] text-primary/80 uppercase font-bold tracking-widest mt-1.5 block">
                            {selectedItem.type} Result Mapped
                          </span>
                        </div>

                        {/* Launch Action(s) — for component results the user can
                            open Items *or* Inventory; other types keep the single arrow. */}
                        <div className="flex items-center gap-2">
                          {selectedItem.type === "component" && (
                            isEnabled("inventory") ? (
                              <button
                                onClick={() => openInInventory(selectedItem.data.genericPN)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-bold text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all shadow-xs"
                                title="Open this item in Inventory"
                              >
                                <Boxes className="h-3.5 w-3.5 text-primary" />
                                <span>Inventory</span>
                              </button>
                            ) : (
                              <div
                                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/40 px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground cursor-not-allowed"
                                title="The Inventory module is not included in your plan."
                              >
                                <Lock className="h-3.5 w-3.5" />
                                <span>Inventory</span>
                              </div>
                            )
                          )}
                          <button
                            onClick={() => selectItem(selectedItem)}
                            className="bg-primary hover:bg-primary/95 text-primary-foreground p-2 rounded-lg transition-all shadow-xs group"
                            title={selectedItem.type === "component" ? "Open in Items (details)" : "Navigate to Details Page"}
                          >
                            <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                          </button>
                        </div>
                      </div>

                      {/* Dynamic Render based on result type */}

                      {/* 1. Component Details */}
                      {selectedItem.type === "component" && (
                        <div className="space-y-6 text-xs">
                          <div className="grid grid-cols-2 gap-4 text-left">
                            <div className="bg-background border border-border/40 rounded-xl p-4 shadow-3xs">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground block tracking-wider">Generic PN</span>
                              <span className="font-mono text-sm font-bold text-primary mt-1.5 block">
                                <HighlightText text={selectedItem.data.genericPN} query={query} />
                              </span>
                            </div>
                            <div className="bg-background border border-border/40 rounded-xl p-4 shadow-3xs">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground block tracking-wider">Category</span>
                              <span className="text-sm font-semibold text-foreground mt-1.5 block">
                                <HighlightText text={selectedItem.data.category} query={query} />
                              </span>
                            </div>
                            <div className="bg-background border border-border/40 rounded-xl p-4 shadow-3xs">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground block tracking-wider">Total Manufacturers</span>
                              <span className="text-sm font-semibold text-foreground mt-1.5 block">{selectedItem.data.brands.length}</span>
                            </div>
                            <div className="bg-background border border-border/40 rounded-xl p-4 shadow-3xs">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground block tracking-wider">Total Stock</span>
                              <span className="text-sm font-semibold text-foreground mt-1.5 block">{selectedItem.data.stock.toLocaleString()}</span>
                            </div>
                          </div>

                          {/* Brand Variants Table */}
                          <div className="space-y-2 text-left">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">Manufacturer Variants</span>
                            <div className="border border-border/40 rounded-lg overflow-hidden bg-background shadow-3xs">
                              <table className="w-full text-xs text-left text-foreground">
                                <thead className="bg-muted/40 text-muted-foreground/85 text-[10px] uppercase font-semibold border-b border-border/40">
                                  <tr>
                                    <th className="px-4 py-2.5">Manufacturer</th>
                                    <th className="px-4 py-2.5">Manufacturer Part No</th>
                                    <th className="px-4 py-2.5 text-right">Stock</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/30 font-medium">
                                  {selectedItem.data.brands.map((b) => (
                                    <tr key={b.brand} className="hover:bg-muted/5 transition-colors">
                                      <td className="px-4 py-3 font-semibold text-foreground/90">
                                        <HighlightText text={b.brand} query={query} />
                                      </td>
                                      <td className="px-4 py-3 font-mono text-[11px] text-primary">
                                        <HighlightText text={b.partNo} query={query} />
                                      </td>
                                      <td className="px-4 py-3 text-right font-mono font-bold text-foreground/80">{b.stock.toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Used In List */}
                          {selectedItem.data.usedIn && selectedItem.data.usedIn.length > 0 && (
                            <div className="space-y-2 text-left">
                              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">Used In Products</span>
                              <div className="flex flex-wrap gap-2">
                                {selectedItem.data.usedIn.map((productName) => (
                                  <span 
                                    key={productName}
                                    className="inline-flex items-center rounded-lg bg-secondary/80 border border-border px-3 py-1.5 text-xs font-semibold text-foreground"
                                  >
                                    <HighlightText text={productName} query={query} />
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 2. Product Details */}
                      {selectedItem.type === "product" && (
                        <div className="space-y-5 text-xs text-left">
                          <div className="bg-background border border-border/40 rounded-xl p-4 shadow-3xs">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Description</span>
                            <p className="text-xs text-foreground/80 mt-2 leading-relaxed font-normal">
                              <HighlightText text={selectedItem.data.description} query={query} />
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-background border border-border/40 rounded-xl p-4 shadow-3xs">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Product Code</span>
                              <span className="font-mono text-sm font-bold text-primary mt-1.5 block">
                                <HighlightText text={selectedItem.data.code} query={query} />
                              </span>
                            </div>
                            <div className="bg-background border border-border/40 rounded-xl p-4 shadow-3xs">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Estimated Cost</span>
                              <span className="text-sm font-bold text-foreground mt-1.5 block">{selectedItem.data.estimatedCost}</span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">Associated PCBs</span>
                            <div className="flex flex-col gap-2">
                              {selectedItem.data.pcbs.map((pcb) => (
                                <div key={pcb} className="flex items-center gap-3 p-3.5 bg-background border border-border/40 rounded-xl font-semibold shadow-3xs">
                                  <Layers className="h-4 w-4 text-primary" />
                                  <span>
                                    <HighlightText text={pcb} query={query} />
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 3. PCB Details */}
                      {selectedItem.type === "pcb" && (
                        <div className="space-y-5 text-xs text-left">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-background border border-border/40 rounded-xl p-4 shadow-3xs">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Parent Product</span>
                              <span className="text-sm font-bold text-primary mt-1.5 block">
                                <HighlightText text={selectedItem.data.productName} query={query} />
                              </span>
                            </div>
                            <div className="bg-background border border-border/40 rounded-xl p-4 shadow-3xs">
                              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Parent Code</span>
                              <span className="font-mono text-sm font-semibold text-foreground mt-1.5 block">
                                <HighlightText text={selectedItem.data.productCode} query={query} />
                              </span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">BOM Material Highlights ({selectedItem.data.components.length})</span>
                            <div className="border border-border/40 rounded-lg overflow-hidden bg-background shadow-3xs">
                              <table className="w-full text-xs text-left text-foreground">
                                <thead className="bg-muted/40 text-muted-foreground/85 text-[10px] uppercase font-semibold border-b border-border/40">
                                  <tr>
                                    <th className="px-4 py-2.5">Item</th>
                                    <th className="px-4 py-2.5 text-right">Generic PN</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/30 font-medium">
                                  {selectedItem.data.components.map((c) => (
                                    <tr key={c.genericPN} className="hover:bg-muted/5 transition-colors">
                                      <td className="px-4 py-3 font-semibold text-foreground/90">
                                        <HighlightText text={c.name} query={query} />
                                      </td>
                                      <td className="px-4 py-3 text-right font-mono text-[11px] text-primary">
                                        <HighlightText text={c.genericPN} query={query} />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 4. Brand Details */}
                      {selectedItem.type === "brand" && (
                        <div className="space-y-5 text-xs text-left">
                          <div className="bg-background border border-border/40 rounded-xl p-4 shadow-3xs">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Total Items Carried</span>
                            <span className="text-sm font-bold text-primary mt-1.5 block">{selectedItem.data.componentCount} items</span>
                          </div>

                          <div className="space-y-2">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">Qualified catalog items</span>
                            <div className="border border-border/40 rounded-lg overflow-hidden bg-background shadow-3xs">
                              <table className="w-full text-xs text-left text-foreground">
                                <thead className="bg-muted/40 text-muted-foreground/85 text-[10px] uppercase font-semibold border-b border-border/40">
                                  <tr>
                                    <th className="px-4 py-2.5">Item</th>
                                    <th className="px-4 py-2.5">Generic PN</th>
                                    <th className="px-4 py-2.5 text-right">Manufacturer PN</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/30 font-medium">
                                  {selectedItem.data.components.map((c) => (
                                    <tr key={c.partNo} className="hover:bg-muted/5 transition-colors">
                                      <td className="px-4 py-3 font-semibold text-foreground/90">
                                        <HighlightText text={c.name} query={query} />
                                      </td>
                                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                                        <HighlightText text={c.genericPN} query={query} />
                                      </td>
                                      <td className="px-4 py-3 text-right font-mono text-[11px] text-primary">
                                        <HighlightText text={c.partNo} query={query} />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 5. Supplier Details */}
                      {selectedItem.type === "supplier" && (
                        <div className="space-y-5 text-xs text-left">
                          <div className="bg-background border border-border/40 rounded-xl p-4 shadow-3xs">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Supplier Name</span>
                            <span className="text-sm font-bold text-primary mt-1.5 block">
                              <HighlightText text={selectedItem.data.name} query={query} />
                            </span>
                          </div>

                          <div className="space-y-2">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">Matrix Offerings ({selectedItem.data.components.length})</span>
                            <div className="border border-border/40 rounded-lg overflow-hidden bg-background shadow-3xs">
                              <table className="w-full text-xs text-left text-foreground">
                                <thead className="bg-muted/40 text-muted-foreground/85 text-[10px] uppercase font-semibold border-b border-border/40">
                                  <tr>
                                    <th className="px-4 py-2.5">Item</th>
                                    <th className="px-4 py-2.5">Manufacturer</th>
                                    <th className="px-4 py-2.5 text-right">Negotiated Price</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/30 font-medium">
                                  {selectedItem.data.components.map((c, index) => (
                                    <tr key={index} className="hover:bg-muted/5 transition-colors">
                                      <td className="px-4 py-3 font-semibold text-foreground/90">
                                        <HighlightText text={c.name} query={query} /> ({c.genericPN})
                                      </td>
                                      <td className="px-4 py-3 text-muted-foreground font-semibold">
                                        <HighlightText text={c.brand} query={query} />
                                      </td>
                                      <td className="px-4 py-3 text-right font-mono text-primary font-bold">{c.price}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}

                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                      <FileText className="h-8 w-8 text-muted-foreground/45 mb-2 stroke-1" />
                      <p className="text-sm font-semibold">Select a result to preview</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Hover over or press arrows to select items.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Search Footer Tips */}
            <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-5 py-3 shrink-0 text-[10px] text-muted-foreground/80 font-bold">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <span className="border border-border bg-background px-1.5 py-0.2 rounded font-mono">↑↓</span> Navigate
                </span>
                <span className="flex items-center gap-1">
                  <span className="border border-border bg-background px-1.5 py-0.2 rounded font-mono">↵</span> Select Item
                </span>
                <span className="flex items-center gap-1">
                  <span className="border border-border bg-background px-1.5 py-0.2 rounded font-mono">ESC</span> Close
                </span>
              </div>
              <div>
                {query.trim() ? `Showing ${results.length} results` : "Command Center Ready"}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
