"use client"

import * as React from "react"
import { X, Plus, Trash2, PencilRuler, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ImportedBomLine } from "@/lib/bom-import"

interface ManualLine {
  type: string
  name: string
  partNumber: string
  solderType: string
  footprint: string
  qty: string
}

export interface ManualProductData {
  name: string
  code: string
  description: string
  versionLabel: string
  lines: ImportedBomLine[]
}

type Props = {
  /** "product" collects product identity + a first BOM; "version" only a labelled BOM. */
  mode?: "product" | "version"
  defaultVersionLabel?: string
  onApply: (data: ManualProductData) => void
  onClose: () => void
}

const emptyLine = (): ManualLine => ({
  type: "",
  name: "",
  partNumber: "",
  solderType: "SMD",
  footprint: "",
  qty: "1",
})

export function AddProductModal({ mode = "product", defaultVersionLabel = "v1", onApply, onClose }: Props) {
  const isProduct = mode === "product"
  const [name, setName] = React.useState("")
  const [code, setCode] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [versionLabel, setVersionLabel] = React.useState(defaultVersionLabel)
  const [lines, setLines] = React.useState<ManualLine[]>([emptyLine(), emptyLine()])
  const [error, setError] = React.useState<string | null>(null)

  const updateLine = (i: number, field: keyof ManualLine, value: string) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))
    setError(null)
  }
  const addLine = () => setLines((prev) => [...prev, emptyLine()])
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i))

  const submit = () => {
    if (isProduct && !name.trim()) return setError("Enter a product name.")
    if (!versionLabel.trim()) return setError("Enter a BOM version label.")
    const cleaned: ImportedBomLine[] = lines
      .filter((l) => l.name.trim() || l.partNumber.trim())
      .map((l) => ({
        type: l.type.trim(),
        name: l.name.trim(),
        partNumber: l.partNumber.trim(),
        solderType: l.solderType.trim(),
        footprint: l.footprint.trim(),
        qty: Math.max(0, Math.round(Number(l.qty) || 0)) || 1,
        manufacturer: "",
        supplier: "",
        reference: "",
      }))
    if (cleaned.length === 0) return setError("Add at least one component line (Name or Part Number).")
    onApply({
      name: name.trim(),
      code: code.trim(),
      description: description.trim(),
      versionLabel: versionLabel.trim(),
      lines: cleaned,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PencilRuler className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">
                {isProduct ? "Add Product Manually" : "Add BOM Version Manually"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isProduct
                  ? "Define the product and its first bill of materials."
                  : "Enter a new labelled bill of materials for this product."}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-5 py-5 overflow-y-auto">
          {isProduct && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Product Name *
                </label>
                <Input value={name} onChange={(e) => { setName(e.target.value); setError(null) }} placeholder="e.g. RoIP 400 Gateway" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Code
                </label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. ROIP400" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Version Label
                </label>
                <Input value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="v1" />
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Description
                </label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description of the product" />
              </div>
            </div>
          )}

          {!isProduct && (
            <div className="space-y-1.5 max-w-xs">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Version Label
              </label>
              <Input value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="e.g. v2, Rev B" />
            </div>
          )}

          {/* BOM lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-muted-foreground/70 tracking-wider">
                Bill of Materials
              </span>
              <Button type="button" variant="outline" size="sm" onClick={addLine} className="gap-1 border-border font-bold">
                <Plus className="h-3.5 w-3.5" />
                <span>Add Line</span>
              </Button>
            </div>
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-muted/40 text-muted-foreground border-b border-border text-[10px] uppercase font-bold">
                  <tr>
                    <th className="px-2 py-2 w-28">Type</th>
                    <th className="px-2 py-2 min-w-[160px]">Name</th>
                    <th className="px-2 py-2 w-32">Part Number</th>
                    <th className="px-2 py-2 w-20">Solder</th>
                    <th className="px-2 py-2 w-28">Footprint</th>
                    <th className="px-2 py-2 w-16 text-center">Qty</th>
                    <th className="px-2 py-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((l, i) => (
                    <tr key={i} className="hover:bg-muted/10">
                      <td className="px-2 py-1.5">
                        <Input value={l.type} onChange={(e) => updateLine(i, "type", e.target.value)} placeholder="Capacitor" className="h-8 text-xs" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input value={l.name} onChange={(e) => updateLine(i, "name", e.target.value)} placeholder="0.1uF/100nF" className="h-8 text-xs" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input value={l.partNumber} onChange={(e) => updateLine(i, "partNumber", e.target.value)} placeholder="MPN" className="h-8 text-xs" />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={l.solderType}
                          onChange={(e) => updateLine(i, "solderType", e.target.value)}
                          className="h-8 w-full rounded-md border border-border bg-background px-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="SMD">SMD</option>
                          <option value="DIP">DIP</option>
                          <option value="">—</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input value={l.footprint} onChange={(e) => updateLine(i, "footprint", e.target.value)} placeholder="C0603" className="h-8 text-xs" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input type="number" min={1} value={l.qty} onChange={(e) => updateLine(i, "qty", e.target.value)} className="h-8 text-xs text-center" />
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          aria-label="Remove line"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                        No lines. Click “Add Line”.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="font-medium">{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit}>
            {isProduct ? "Create Product" : "Add Version"}
          </Button>
        </div>
      </div>
    </div>
  )
}
