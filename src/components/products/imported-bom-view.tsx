"use client"

import * as React from "react"
import { Package, Cpu, Nut } from "lucide-react"
import type { ImportedBomLine } from "@/lib/bom-import"
import { DragScrollArea } from "@/components/ui/drag-scroll-area"

type Props = {
  productName: string
  lines: ImportedBomLine[]
  viewMode: "tree" | "excel"
  buildQty: number
}

// Renders an imported (catalog-unmatched) BOM in the same two visual modes as
// the canonical Product Structure card. Kept separate from the catalog-driven
// markup so neither path has to carry the other's concerns.
export function ImportedBomView({ productName, lines, viewMode, buildQty }: Props) {
  const totalParts = lines.reduce((s, l) => s + l.qty, 0)
  const scaled = buildQty > 1

  // Group by Type for the tree view (the imported sheet has no PCB dimension).
  const groups = React.useMemo(() => {
    const map = new Map<string, ImportedBomLine[]>()
    for (const l of lines) {
      const key = l.type || "Uncategorized"
      const arr = map.get(key)
      if (arr) arr.push(l)
      else map.set(key, [l])
    }
    return [...map.entries()]
  }, [lines])

  if (viewMode === "tree") {
    return (
      <DragScrollArea className="p-6 md:p-8 overflow-x-auto">
        <div className="space-y-6">
          {/* Root product node */}
          <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 p-3 rounded-lg w-fit shadow-xs">
            <Package className="h-5 w-5 text-primary" />
            <span className="font-extrabold text-primary text-sm uppercase tracking-wider">
              {productName}
            </span>
            <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full uppercase tracking-wider">
              Imported
            </span>
            {scaled && (
              <span className="text-xs font-bold text-amber-600 bg-amber-500/10 px-2.5 py-0.5 rounded-full">
                Build Qty: {buildQty.toLocaleString()} units
              </span>
            )}
          </div>

          {/* Type groups */}
          <div className="relative pl-6 space-y-8 before:absolute before:left-3.5 before:top-0 before:bottom-3 before:w-[2px] before:bg-border/60">
            {groups.map(([type, items]) => (
              <div key={type} className="relative">
                <div className="absolute -left-6 top-5 w-6 h-[2px] bg-border/60" />
                <div className="flex items-center gap-3 bg-secondary/80 border border-border p-3 rounded-lg w-fit shadow-xs relative z-10">
                  <Cpu className="h-4 w-4 text-foreground/80" />
                  <span className="font-bold text-foreground text-sm">{type}</span>
                  <span className="font-mono text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
                    {items.length} parts
                  </span>
                </div>

                <div className="relative pl-8 mt-2 space-y-5 before:absolute before:left-3.5 before:top-0 before:bottom-3 before:w-[2px] before:border-l-2 before:border-dashed before:border-border">
                  {items.map((l, i) => (
                    <div key={i} className="relative">
                      <div className="relative flex items-start gap-3.5 group">
                        <div className="absolute -left-8 top-5 w-8 h-[2px] border-t-2 border-dashed border-border group-hover:border-primary/50 transition-colors" />
                        <div className="flex flex-col gap-1.5 w-full max-w-sm bg-background border border-border/80 rounded-xl p-3.5 relative z-10 shadow-2xs hover:border-primary/40 transition-all">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 font-bold text-foreground text-xs">
                              <Nut className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                              <span>{l.name || l.partNumber || "—"}</span>
                            </div>
                            <div className="flex items-center gap-1.5 font-mono text-xs">
                              <span className="text-primary font-bold">× {l.qty}</span>
                              {scaled && (
                                <span className="text-amber-600 dark:text-amber-500 font-medium">
                                  ({(l.qty * buildQty).toLocaleString()} req.)
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-border/40 text-[10px]">
                            <div className="flex flex-col">
                              <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">
                                Part Number
                              </span>
                              <span className="font-mono font-bold text-primary">
                                {l.partNumber || "—"}
                              </span>
                            </div>
                            <div className="flex flex-col items-end">
                              <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">
                                Footprint
                              </span>
                              <span className="font-mono font-semibold text-foreground">
                                {l.footprint || "—"}
                              </span>
                            </div>
                            {l.solderType && (
                              <div className="flex flex-col">
                                <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">
                                  Solder
                                </span>
                                <span className="font-semibold text-foreground">{l.solderType}</span>
                              </div>
                            )}
                            {l.manufacturer && (
                              <div className="flex flex-col items-end">
                                <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">
                                  Manufacturer
                                </span>
                                <span className="font-semibold text-foreground">{l.manufacturer}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DragScrollArea>
    )
  }

  // ===== Excel / flat table view =====
  return (
    <DragScrollArea className="overflow-x-auto">
      <table className="w-full text-left text-xs text-foreground whitespace-nowrap">
        <thead className="bg-muted/40 text-muted-foreground border-b border-border text-[10px] uppercase font-bold sticky top-0">
          <tr>
            <th scope="col" className="px-3 py-3 text-center w-10">#</th>
            <th scope="col" className="px-3 py-3">Reference</th>
            <th scope="col" className="px-3 py-3">Type</th>
            <th scope="col" className="px-3 py-3 min-w-[160px]">Name</th>
            <th scope="col" className="px-3 py-3">Part Number</th>
            <th scope="col" className="px-3 py-3 text-center">Solder Type</th>
            <th scope="col" className="px-3 py-3">Footprint</th>
            <th scope="col" className="px-3 py-3 text-center">Qty</th>
            {scaled && <th scope="col" className="px-3 py-3 text-center">Qty Needed</th>}
            <th scope="col" className="px-3 py-3">Manufacturer</th>
            <th scope="col" className="px-3 py-3">Supplier</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {lines.map((l, idx) => (
            <tr key={idx} className="transition-colors hover:bg-muted/20">
              <td className="px-3 py-2.5 text-center font-mono text-muted-foreground">{idx + 1}</td>
              <td className="px-3 py-2.5 font-mono text-[11px] font-bold text-primary">
                {l.reference || "—"}
              </td>
              <td className="px-3 py-2.5">
                <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground font-mono">
                  {l.type || "—"}
                </span>
              </td>
              <td className="px-3 py-2.5 font-semibold text-foreground">
                <div className="flex items-center gap-2">
                  <Nut className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="whitespace-normal">{l.name || "—"}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 font-mono text-muted-foreground">{l.partNumber || "—"}</td>
              <td className="px-3 py-2.5 text-center">
                {l.solderType ? (
                  <span className="font-mono text-[10px] font-bold text-foreground">{l.solderType}</span>
                ) : "—"}
              </td>
              <td className="px-3 py-2.5 font-mono text-muted-foreground">{l.footprint || "—"}</td>
              <td className="px-3 py-2.5 text-center font-mono font-bold text-primary">{l.qty}</td>
              {scaled && (
                <td className="px-3 py-2.5 text-center font-mono font-bold text-amber-600">
                  {(l.qty * buildQty).toLocaleString()}
                </td>
              )}
              <td className="px-3 py-2.5 text-muted-foreground">
                {l.manufacturer ? (
                  <span className="font-semibold text-foreground">{l.manufacturer}</span>
                ) : "—"}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {l.supplier ? (
                  <span className="font-semibold text-foreground">{l.supplier}</span>
                ) : "—"}
              </td>
            </tr>
          ))}
          {/* Totals row */}
          <tr className="bg-muted/40 font-bold border-t-2 border-border">
            <td className="px-3 py-3" />
            <td
              className="px-3 py-3 uppercase text-[10px] tracking-wider text-muted-foreground"
              colSpan={6}
            >
              Total — {lines.length} line items
            </td>
            <td className="px-3 py-3 text-center font-mono text-primary">{totalParts}</td>
            {scaled && (
              <td className="px-3 py-3 text-center font-mono text-amber-600">
                {(totalParts * buildQty).toLocaleString()}
              </td>
            )}
            <td className="px-3 py-3" />
            <td className="px-3 py-3" />
          </tr>
        </tbody>
      </table>
    </DragScrollArea>
  )
}
