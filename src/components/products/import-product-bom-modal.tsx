"use client"

import * as React from "react"
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  CircuitBoard,
  ChevronRight,
  Nut,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { parseBomWorkbook, type ImportedPcb, type WorkbookBomResult } from "@/lib/bom-import"

type Props = {
  /** Called with the tabs the user chose to import as PCBs. */
  onApply: (pcbs: ImportedPcb[], name: string, fileName: string) => void
  onClose: () => void
  defaultProductName?: string
}

/**
 * Multi-sheet BOM import. Each workbook tab becomes a candidate PCB; the user
 * picks which tabs to import and each is created as its own PCB (with its
 * components) — mirroring the manual "Add Product" PCB → components layout.
 * The single-sheet flat importer lives in import-bom-modal.tsx (BOM versions).
 */
export function ImportProductBomModal({ onApply, onClose, defaultProductName }: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = React.useState("")
  const [productName, setProductName] = React.useState(defaultProductName ?? "")
  const [result, setResult] = React.useState<WorkbookBomResult | null>(null)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [dragOver, setDragOver] = React.useState(false)

  const handleFile = async (file: File) => {
    setError(null)
    setResult(null)
    setSelected(new Set())
    setExpanded(new Set())
    setBusy(true)
    setFileName(file.name)
    if (!productName.trim()) {
      setProductName(file.name.replace(/\.[^.]+$/, ""))
    }
    try {
      const parsed = await parseBomWorkbook(file)
      setResult(parsed)
      // Pre-select real board BOMs; leave empty tabs and cross-board roll-ups
      // (e.g. "Combined") unticked for the user to opt into.
      setSelected(
        new Set(parsed.pcbs.filter((p) => p.isBom && !p.isRollup).map((p) => p.sheetName)),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read the file.")
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void handleFile(file)
  }

  const toggle = (sheetName: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(sheetName)) next.delete(sheetName)
      else next.add(sheetName)
      return next
    })

  const toggleExpand = (sheetName: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(sheetName)) next.delete(sheetName)
      else next.add(sheetName)
      return next
    })

  const pcbs = result?.pcbs ?? []
  const chosen = pcbs.filter((p) => selected.has(p.sheetName))
  const totalComponents = chosen.reduce((s, p) => s + p.lines.length, 0)
  const totalParts = chosen.reduce((s, p) => s + p.lines.reduce((t, l) => t + l.qty, 0), 0)

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
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Import Product BOM from Excel</h3>
              <p className="text-xs text-muted-foreground">
                Each sheet becomes a PCB — pick which tabs to import.
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
          {/* Product name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Product Name
            </label>
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. SSCE Gateway"
            />
          </div>

          {/* Dropzone */}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFile(file)
              e.target.value = ""
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors cursor-pointer ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            {busy ? (
              <Loader2 className="h-7 w-7 text-primary animate-spin" />
            ) : (
              <UploadCloud className="h-7 w-7 text-muted-foreground" />
            )}
            <div className="text-sm font-semibold text-foreground">
              {fileName || "Drop your multi-sheet BOM here or click to browse"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              One sheet per PCB · columns like Type, Name, Part Number, Solder Type, Footprint, Quantity
            </div>
          </button>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {/* Parsed PCB tabs */}
          {result && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-xs">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="font-semibold text-foreground">
                  {chosen.length} of {pcbs.length} sheets selected
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{totalComponents} items</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {totalParts.toLocaleString()} total parts
                </span>
              </div>

              {/* One card per sheet */}
              <div className="space-y-2.5">
                {pcbs.map((pcb) => {
                  const isSelected = selected.has(pcb.sheetName)
                  const isOpen = expanded.has(pcb.sheetName)
                  const parts = pcb.lines.reduce((t, l) => t + l.qty, 0)
                  const preview = pcb.lines.slice(0, 6)
                  return (
                    <div
                      key={pcb.sheetName}
                      className={`rounded-lg border transition-colors ${
                        isSelected ? "border-primary/40 bg-primary/[0.03]" : "border-border bg-muted/10"
                      }`}
                    >
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={pcb.lines.length === 0}
                          onChange={() => toggle(pcb.sheetName)}
                          className="h-4 w-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Import ${pcb.sheetName}`}
                        />
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <CircuitBoard className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-bold text-sm text-foreground">
                              {pcb.name}
                            </span>
                            {!pcb.isBom ? (
                              <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                                {pcb.lines.length === 0 ? "empty" : "not a typical BOM"}
                              </span>
                            ) : pcb.isRollup ? (
                              <span
                                className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600"
                                title="Looks like a cross-board summary sheet, not a single PCB — unticked by default."
                              >
                                roll-up
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {pcb.lines.length} items · {parts.toLocaleString()} parts
                            {pcb.skippedRows > 0 && ` · ${pcb.skippedRows} blank rows skipped`}
                          </div>
                        </div>
                        {pcb.lines.length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleExpand(pcb.sheetName)}
                            className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
                          >
                            <ChevronRight
                              className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`}
                            />
                            {isOpen ? "Hide" : "Preview"}
                          </button>
                        )}
                      </div>

                      {/* Component preview */}
                      {isOpen && preview.length > 0 && (
                        <div className="border-t border-border/60 px-3 pb-3 pt-2">
                          <table className="w-full text-left text-[11px]">
                            <thead className="text-[9px] uppercase font-bold text-muted-foreground/70">
                              <tr>
                                <th className="py-1 pr-2">Name</th>
                                <th className="py-1 pr-2">Part Number</th>
                                <th className="py-1 pr-2">Ref Des</th>
                                <th className="py-1 pr-2">Footprint</th>
                                <th className="py-1 pr-2">Manufacturer</th>
                                <th className="py-1 text-center">Qty</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                              {preview.map((l, i) => (
                                <tr key={i}>
                                  <td className="py-1 pr-2 font-semibold text-foreground">
                                    <span className="flex items-center gap-1.5">
                                      <Nut className="h-3 w-3 text-muted-foreground shrink-0" />
                                      {l.name || "—"}
                                    </span>
                                  </td>
                                  <td className="py-1 pr-2 font-mono text-primary">
                                    {l.partNumber || "—"}
                                  </td>
                                  <td className="py-1 pr-2 font-mono text-muted-foreground">
                                    {l.reference || "—"}
                                  </td>
                                  <td className="py-1 pr-2 font-mono text-muted-foreground">
                                    {l.footprint || "—"}
                                  </td>
                                  <td className="py-1 pr-2 text-muted-foreground">
                                    {l.manufacturer || "—"}
                                  </td>
                                  <td className="py-1 text-center font-mono font-bold text-primary">
                                    {l.qty}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {pcb.lines.length > preview.length && (
                            <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                              + {pcb.lines.length - preview.length} more items
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-4 shrink-0">
          <span className="text-[11px] text-muted-foreground">
            {result ? `${chosen.length} PCB${chosen.length === 1 ? "" : "s"} will be created` : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!result || busy || chosen.length === 0}
              onClick={() =>
                onApply(
                  chosen,
                  productName.trim() || defaultProductName || "Imported Product",
                  fileName,
                )
              }
            >
              Import {chosen.length > 0 ? `${chosen.length} PCB${chosen.length === 1 ? "" : "s"}` : ""}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
