"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Boxes } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/data-provider"
import { ComponentForm, type ComponentFormInitial } from "@/app/components/component-form"

function EditComponentContent() {
  const searchParams = useSearchParams()
  const d = useData()
  const componentId = searchParams.get("component") || ""
  const component = d.COMPONENTS.find((c) => c.id === componentId)

  if (!component) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <span>Items</span>
            <span>/</span>
            <span className="text-foreground font-medium">Edit Item</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Edit Item</h1>
        </div>
        <Card className="border border-border shadow-sm">
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Boxes className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-bold text-foreground">Item not found</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                This item could not be located. It may have been deleted or the link is stale.
              </p>
            </div>
            <Button variant="outline" render={<Link href="/components/list" />} className="gap-2 border-border bg-background">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Item List</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const initial: ComponentFormInitial = {
    category: component.category,
    categoryId: component.categoryId ?? "",
    itemType: component.itemType ?? "raw",
    name: component.name,
    genericPN: component.genericPN,
    description: component.description ?? "",
    unit: component.unit || "PCS",
    minStock: component.minStock ? String(component.minStock) : "",
    solderType: component.solderType,
    footprint: component.footprint ?? "",
    spq: component.spq ? String(component.spq) : "",
    moq: component.reorderQty ? String(component.reorderQty) : "",
    specifications: component.specs?.length ? component.specs.map((s) => ({ key: s.key, value: s.value })) : [],
    brandVariants: component.brandVariants.map((v) => ({
      brand: d.getBrandName(v.brandId),
      partNo: v.partNo,
      stock: v.stock ? String(v.stock) : "",
      existing: true,
    })),
  }

  return <ComponentForm mode="edit" componentId={componentId} initial={initial} />
}

export default function EditComponentPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex h-[400px] items-center justify-center text-muted-foreground text-sm font-medium">
          Loading item…
        </div>
      }
    >
      <EditComponentContent />
    </React.Suspense>
  )
}
