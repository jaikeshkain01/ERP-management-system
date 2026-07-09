"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Plus, Trash2, CheckCircle2, AlertCircle, Cpu, Award } from "lucide-react"
import Link from "next/link"

interface Specification {
  key: string
  value: string
}

interface BrandVariant {
  brand: string
  partNo: string
  stock: string
}

export default function AddComponentPage() {
  const router = useRouter()
  const [toast, setToast] = React.useState<{ message: string; type: "success" | "error" } | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  // Section 1: Basic Information
  const [category, setCategory] = React.useState("Passive Components")
  const [name, setName] = React.useState("")
  const [genericPN, setGenericPN] = React.useState("")

  // Section 2: PCB & Packaging Information
  const [solderType, setSolderType] = React.useState<"SMD" | "DIP">("SMD")
  const [footprint, setFootprint] = React.useState("")
  const [spq, setSpq] = React.useState("")
  const [moq, setMoq] = React.useState("")

  // Section 3: Brand Variants (Dynamic list)
  const [brandVariants, setBrandVariants] = React.useState<BrandVariant[]>([
    { brand: "Yageo", partNo: "RC0603JR-0710KL", stock: "1200" },
    { brand: "Vishay", partNo: "CRCW060310K0FKEA", stock: "800" }
  ])

  // Section 4: Specifications (Dynamic list)
  const [specifications, setSpecifications] = React.useState<Specification[]>([
    { key: "Tolerance", value: "±5%" },
    { key: "Power Rating", value: "0.25W" },
    { key: "Voltage", value: "50V" }
  ])

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Prepopulate generic part number suggestions based on name
  React.useEffect(() => {
    if (!genericPN && name) {
      const cleanName = name.replace(/\s+/g, "-").toUpperCase()
      const prefix = category.toLowerCase().includes("passive") ? "RES" : "COMP"
      setGenericPN(`${prefix}-${cleanName}`)
    }
  }, [name, category])

  // Brand Variants handlers
  const handleAddBrandVariant = () => {
    setBrandVariants([...brandVariants, { brand: "", partNo: "", stock: "" }])
  }

  const handleUpdateBrandVariant = (index: number, field: keyof BrandVariant, val: string) => {
    const updated = [...brandVariants]
    updated[index][field] = val
    setBrandVariants(updated)
  }

  const handleRemoveBrandVariant = (index: number) => {
    setBrandVariants(brandVariants.filter((_, i) => i !== index))
  }

  // Specifications handlers
  const handleAddSpecification = () => {
    setSpecifications([...specifications, { key: "", value: "" }])
  }

  const handleUpdateSpecification = (index: number, field: keyof Specification, val: string) => {
    const updated = [...specifications]
    updated[index][field] = val
    setSpecifications(updated)
  }

  const handleRemoveSpecification = (index: number) => {
    setSpecifications(specifications.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validations
    if (!name.trim()) {
      showToast("Please enter component name", "error")
      return
    }
    if (!genericPN.trim()) {
      showToast("Please enter Generic Part Number", "error")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch("/api/components", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          genericPN: genericPN.trim(),
          name: name.trim(),
          category,
          solderType,
          footprint: footprint.trim() || undefined,
          spq: spq ? parseInt(spq, 10) : undefined,
          reorderQty: moq ? parseInt(moq, 10) : undefined,
          specs: specifications.filter((s) => s.key.trim()),
          variants: brandVariants
            .filter((v) => v.brand.trim() && v.partNo.trim())
            .map((v) => ({ brand: v.brand.trim(), partNo: v.partNo.trim(), stock: v.stock ? parseInt(v.stock, 10) : undefined })),
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        showToast(body?.error?.message ?? "Failed to register component", "error")
        return
      }
      showToast("Component registered successfully!", "success")
      setTimeout(() => router.push("/components/list"), 1000)
    } finally {
      setIsSubmitting(false)
    }
  }

  const commonFootprints = solderType === "SMD" 
    ? ["0603", "0805", "1206", "SOT-23", "SOIC-8", "QFN-32"] 
    : ["DIP-8", "DIP-14", "TO-92", "TO-220"]

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 shadow-xl border transition-all transform duration-300 bg-background ${
          toast.type === "success" 
            ? "border-emerald-500/35 text-emerald-600 dark:text-emerald-400" 
            : "border-destructive/35 text-destructive"
        }`}>
          {toast.type === "success" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertCircle className="h-4 w-4 text-destructive" />}
          <span className="text-sm font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Header Navigation */}
      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <span>Components</span>
          <span>/</span>
          <Link href="/components/list" className="hover:text-foreground transition-colors font-medium">Component List</Link>
          <span>/</span>
          <span className="text-foreground font-semibold">Add Component</span>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" render={<Link href="/components/list" />} className="h-9 w-9 rounded-lg border-border">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Add Component</h1>
            <p className="text-muted-foreground">Register a new raw component with nested brand variants.</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Section 1: Basic Information */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="bg-muted/10 border-b border-border/60 py-4 px-6">
            <CardTitle className="text-lg font-bold text-foreground">Section 1 — Basic Information</CardTitle>
            <CardDescription>Core identity and internal tracking parameters</CardDescription>
          </CardHeader>
          <CardContent className="p-6 grid gap-6 md:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary font-medium"
              >
                <option value="Passive Components">Passive Components</option>
                <option value="Optoelectronics">Optoelectronics</option>
                <option value="Integrated Circuits (IC)">Integrated Circuits (IC)</option>
                <option value="Mechanical Parts">Mechanical Parts</option>
                <option value="Connectors">Connectors</option>
                <option value="Peripherals">Peripherals</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Name *</label>
              <Input
                placeholder="e.g. Resistor 10K"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-9"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Generic Part Number *</label>
              <Input
                placeholder="e.g. RES-10K"
                value={genericPN}
                onChange={(e) => setGenericPN(e.target.value)}
                required
                className="h-9"
              />
              <span className="text-[10px] text-muted-foreground">Internal company tracking code.</span>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: PCB & Packaging Information */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="bg-muted/10 border-b border-border/60 py-4 px-6">
            <CardTitle className="text-lg font-bold text-foreground">Section 2 — PCB & Packaging Information</CardTitle>
            <CardDescription>Land footprints, packaging counts, and layout types</CardDescription>
          </CardHeader>
          <CardContent className="p-6 grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Solder Type</label>
              <select
                value={solderType}
                onChange={(e) => setSolderType(e.target.value as "SMD" | "DIP")}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary font-medium"
              >
                <option value="SMD">SMD (Surface Mount Device)</option>
                <option value="DIP">DIP (Through Hole)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Footprint</label>
              <Input
                placeholder="e.g. 0603, SOIC-8"
                value={footprint}
                onChange={(e) => setFootprint(e.target.value)}
                className="h-9"
              />
              <div className="flex flex-wrap gap-1.5 mt-1 items-center">
                <span className="text-[10px] text-muted-foreground font-bold mr-1">Suggestions:</span>
                {commonFootprints.map((fp) => (
                  <button
                    key={fp}
                    type="button"
                    onClick={() => setFootprint(fp)}
                    className="text-[10px] border border-border hover:bg-primary/5 hover:border-primary hover:text-primary rounded px-2 py-0.5 font-medium transition-all"
                  >
                    {fp}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SPQ (Standard Pack Quantity)</label>
              <Input
                type="number"
                placeholder="e.g. 5000"
                value={spq}
                onChange={(e) => setSpq(e.target.value)}
                className="h-9"
              />
              <span className="text-[10px] text-muted-foreground">e.g. 5000 pcs per reel or 100 pcs per packet</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">MOQ (Minimum Order Quantity)</label>
              <Input
                type="number"
                placeholder="e.g. 1000"
                value={moq}
                onChange={(e) => setMoq(e.target.value)}
                className="h-9"
              />
              <span className="text-[10px] text-muted-foreground">Standard procurement batch threshold</span>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Brand Variants */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="bg-muted/10 border-b border-border/60 py-4 px-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold text-foreground">Section 3 — Brand Variants</CardTitle>
                <CardDescription>Map manufacturer-specific replacement part numbers and stocks</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddBrandVariant}
                className="gap-1 border-border font-bold hover:bg-primary/5 hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Variant</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-sm text-left text-foreground">
                <thead className="text-[10px] uppercase bg-muted/40 text-muted-foreground border-b border-border">
                  <tr>
                    <th scope="col" className="px-6 py-3 font-bold w-1/3">Brand</th>
                    <th scope="col" className="px-6 py-3 font-bold w-1/3">Brand Part Number</th>
                    <th scope="col" className="px-6 py-3 font-bold w-1/4">Initial Stock</th>
                    <th scope="col" className="px-3 py-3 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-background">
                  {brandVariants.map((variant, idx) => (
                    <tr key={idx} className="hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-3">
                        <Input
                          placeholder="e.g. Yageo, Vishay"
                          value={variant.brand}
                          onChange={(e) => handleUpdateBrandVariant(idx, "brand", e.target.value)}
                          className="h-8 text-sm"
                          required
                        />
                      </td>
                      <td className="px-6 py-3">
                        <Input
                          placeholder="e.g. RC0603JR-0710KL"
                          value={variant.partNo}
                          onChange={(e) => handleUpdateBrandVariant(idx, "partNo", e.target.value)}
                          className="h-8 text-sm"
                          required
                        />
                      </td>
                      <td className="px-6 py-3">
                        <Input
                          type="number"
                          placeholder="e.g. 1000"
                          value={variant.stock}
                          onChange={(e) => handleUpdateBrandVariant(idx, "stock", e.target.value)}
                          className="h-8 text-sm"
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveBrandVariant(idx)}
                          className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all rounded-lg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {brandVariants.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                        <Award className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2 stroke-1" />
                        No brand variants mapped. Click "Add Variant" to map a manufacturer.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Specifications */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="bg-muted/10 border-b border-border/60 py-4 px-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold text-foreground">Section 4 — Technical Specifications</CardTitle>
                <CardDescription>Future-proof key-value specifications matrix</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddSpecification}
                className="gap-1 border-border font-bold hover:bg-primary/5 hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Specification</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-sm text-left text-foreground">
                <thead className="text-[10px] uppercase bg-muted/40 text-muted-foreground border-b border-border">
                  <tr>
                    <th scope="col" className="px-6 py-3 font-bold w-1/2">Specification Key</th>
                    <th scope="col" className="px-6 py-3 font-bold w-1/2">Specification Value</th>
                    <th scope="col" className="px-3 py-3 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-background">
                  {specifications.map((spec, idx) => (
                    <tr key={idx} className="hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-3">
                        <Input
                          placeholder="e.g. Tolerance, Power Rating, Voltage"
                          value={spec.key}
                          onChange={(e) => handleUpdateSpecification(idx, "key", e.target.value)}
                          className="h-8 text-sm"
                          required
                        />
                      </td>
                      <td className="px-6 py-3">
                        <Input
                          placeholder="e.g. ±5%, 0.25W, 50V"
                          value={spec.value}
                          onChange={(e) => handleUpdateSpecification(idx, "value", e.target.value)}
                          className="h-8 text-sm"
                          required
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveSpecification(idx)}
                          className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all rounded-lg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {specifications.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">
                        <Cpu className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2 stroke-1" />
                        No specifications defined. Click "Add Specification" to add details.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            render={<Link href="/components/list" />}
            className="font-bold border-border"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="font-bold bg-primary hover:bg-primary/90 text-primary-foreground min-w-[120px]"
          >
            {isSubmitting ? "Saving..." : "Save Component"}
          </Button>
        </div>
      </form>
    </div>
  )
}
