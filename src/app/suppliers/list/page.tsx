"use client"

import Link from "next/link"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Truck, Filter, Plus, Search, Star, CheckCircle2, ArrowRight } from "lucide-react"
import { useData } from "@/lib/data-provider"

export default function SupplierListPage() {
  const { SUPPLIERS } = useData()
  const suppliers = SUPPLIERS

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <span>Suppliers</span>
          <span>/</span>
          <span className="text-foreground font-medium">Supplier List</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Supplier List</h1>
        <p className="text-muted-foreground">
          Manage vendor accounts, performance ratings, and material supply channels.
        </p>
      </div>

      {/* Top Controls: Search, Filter, Add */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-muted/20 border border-border p-4 rounded-xl">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input 
            placeholder="Search suppliers..." 
            className="pl-9 bg-background border-border"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2 border-border">
            <Filter className="h-4 w-4" />
            <span>Filter</span>
          </Button>
          <Button className="gap-2 font-semibold">
            <Plus className="h-4 w-4" />
            <span>Add Supplier</span>
          </Button>
        </div>
      </div>

      {/* Supplier Cards Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {suppliers.map((supplier) => (
          <Card key={supplier.id} className="flex flex-col transition-all duration-300 hover:shadow-lg hover:border-primary/20 group">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Truck className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold group-hover:text-primary transition-colors">
                      {supplier.name}
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5 line-clamp-1">
                      {supplier.description}
                    </CardDescription>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  {supplier.status}
                </span>
              </div>
            </CardHeader>

            <CardContent className="flex-1 py-4 border-t border-b border-border/50 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-medium">Contact Person:</span>
                <span className="font-semibold text-foreground">{supplier.contact}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-medium">Vendor Rating:</span>
                <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  {supplier.rating} / 5.0
                </span>
              </div>
            </CardContent>

            <CardFooter className="pt-4">
              <Button
                render={<Link href={`/suppliers/details?supplier=${supplier.id}`} />}
                className="w-full font-semibold group/btn"
                variant="secondary"
              >
                <span>Supplier Details</span>
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
