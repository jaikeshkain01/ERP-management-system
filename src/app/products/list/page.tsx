"use client"

import * as React from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Cpu, Filter, Nut, Package, Plus, Search,
  CheckCircle2, ArrowRight, Award, Layers,
  XCircle, AlertTriangle, RefreshCw
} from "lucide-react"
import { PRODUCTS, productUniqueComponents, productBrandCount } from "@/mockdata"

interface ProductData {
  id: string
  name: string
  description: string
  pcbs: number
  components: number
  brands: number
  buildableQty: number
  status: "Ready" | "Blocked" | "Limited"
}

// View model derived from the centralized product → PCB → component graph.
const PRODUCTS_DATA: ProductData[] = PRODUCTS.map((p) => ({
  id: p.id,
  name: p.name,
  description: p.description,
  pcbs: p.pcbs.length,
  components: productUniqueComponents(p).length,
  brands: productBrandCount(p),
  buildableQty: p.buildableQty,
  status: p.status,
}))

export default function ProductListPage() {
  const [searchQuery, setSearchQuery] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<string>("All")

  const handleResetFilters = () => {
    setSearchQuery("")
    setStatusFilter("All")
  }

  // Filter products based on search query and status
  const filteredProducts = PRODUCTS_DATA.filter((product) => {
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase()
      const matchesSearch = 
        product.name.toLowerCase().includes(q) || 
        product.description.toLowerCase().includes(q)
      if (!matchesSearch) return false
    }

    if (statusFilter !== "All" && product.status !== statusFilter) {
      return false
    }

    return true
  })

  const getStatusBadge = (status: "Ready" | "Blocked" | "Limited") => {
    switch (status) {
      case "Ready":
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
            Ready
          </span>
        )
      case "Blocked":
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold bg-destructive/10 text-destructive border border-destructive/20 dark:bg-destructive/20 dark:text-destructive-foreground">
            <XCircle className="h-3 w-3" />
            Blocked
          </span>
        )
      case "Limited":
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Limited
          </span>
        )
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-muted-foreground flex items-center gap-2 font-medium">
            <span className="hover:text-foreground transition-colors cursor-pointer">Products</span>
            <span>/</span>
            <span className="text-foreground font-semibold">Product List</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Product List
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage finished assemblies, configuration variables, and general catalog specifications.
          </p>
        </div>

        {/* Action Button */}
        <Button className="gap-2 font-semibold self-start md:self-auto">
          <Plus className="h-4 w-4" />
          <span>Add Product</span>
        </Button>
      </div>

      {/* Top Controls: Search & Filter */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-card border border-border p-4 rounded-xl shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input 
            placeholder="Search products..." 
            className="pl-9 bg-background border-border"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-semibold">Status:</span>
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-background border border-border rounded-lg text-xs p-2 outline-none focus:ring-1 focus:ring-primary cursor-pointer text-foreground font-semibold min-w-[120px]"
            >
              <option value="All">All Statuses</option>
              <option value="Ready">Ready</option>
              <option value="Limited">Limited</option>
              <option value="Blocked">Blocked</option>
            </select>
          </div>
          {(searchQuery !== "" || statusFilter !== "All") && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer" onClick={handleResetFilters}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Product Cards Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filteredProducts.map((product) => (
          <Card key={product.id} className="flex flex-col transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 border border-border bg-card group relative overflow-hidden">
            <div className="absolute top-0 right-0 h-16 w-16 -mr-4 -mt-4 rounded-full bg-primary/5 transition-all group-hover:scale-110" />
            
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/10">
                    <Package className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold group-hover:text-primary transition-colors">
                      {product.name}
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5 line-clamp-1">
                      {product.description}
                    </CardDescription>
                  </div>
                </div>
                <div className="shrink-0">
                  {getStatusBadge(product.status)}
                </div>
              </div>
            </CardHeader>

            {/* Core Metrics Grid */}
            <CardContent className="flex-1 py-4 border-t border-b border-border/50 bg-muted/5">
              <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-xs">
                
                {/* PCBs Metric */}
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground border border-border/60">
                    <Cpu className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground leading-none">PCBs</span>
                    <span className="text-sm font-black mt-1 text-foreground">{product.pcbs}</span>
                  </div>
                </div>

                {/* Components Metric */}
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground border border-border/60">
                    <Nut className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground leading-none">Components</span>
                    <span className="text-sm font-black mt-1 text-foreground">{product.components}</span>
                  </div>
                </div>

                {/* Brands Metric */}
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground border border-border/60">
                    <Award className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground leading-none">Brands</span>
                    <span className="text-sm font-black mt-1 text-foreground">{product.brands}</span>
                  </div>
                </div>

                {/* Buildable Qty Metric */}
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground border border-border/60">
                    <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground leading-none">Buildable Qty</span>
                    <span className="text-sm font-black mt-1 text-foreground">{product.buildableQty}</span>
                  </div>
                </div>

              </div>
            </CardContent>

            <CardFooter className="pt-4">
              <Button
                render={<Link href={`/products/structure?product=${product.id}`} />}
                className="w-full font-semibold group/btn"
                variant="secondary"
              >
                <span>View Structure</span>
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
              </Button>
            </CardFooter>
          </Card>
        ))}

        {filteredProducts.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground font-semibold bg-card border border-border rounded-xl shadow-2xs">
            No products match your search or filter.
          </div>
        )}
      </div>
    </div>
  )
}
