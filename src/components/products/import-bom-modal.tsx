"use client"

import * as React from "react"
import { X, UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  parseBomFile,
  BOM_FIELD_LABELS,
  type BomImportResult,
  type BomField,
} from "@/lib/bom-import"

type Props = {
  onApply: (result: BomImportResult, name: string, fileName: string) => void
  onClose: () => void
  defaultProductName?: string
  /** Label for the free-text field (defaults to product name; pass a version label for "add version"). */
  nameLabel?: string
  namePlaceholder?: string
  title?: string
  subtitle?: string
  submitLabel?: string
}

// The fields shown in the mapping summary, in display order.
const PREVIEW_FIELDS: BomField[] = [
  "type",
  "name",
  "partNumber",
  "solderType",
  "footprint",
  "qty",
]

export function ImportBomModal({
  onApply,
  onClose,
  defaultProductName,
  nameLabel = "Product / Assembly Name",
  namePlaceholder = "e.g. RoIP 400 Gateway",
  title = "Import BOM from Excel",
  subtitle = "Upload an .xlsx, .xls or .csv file — columns are matched automatically.",
  submitLabel = "Apply Import",
}: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = React.useState("")
  const [productName, setProductName] = React.useState(defaultProductName ?? "")
  const [result, setResult] = React.useState<BomImportResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [dragOver, setDragOver] = React.useState(false)

  const handleFile = async (file: File) => {
    setError(null)
    setResult(null)
    setBusy(true)
    setFileName(file.name)
    if (!productName.trim()) {
      setProductName(file.name.replace(/\.[^.]+$/, ""))
    }
    try {
      const parsed = await parseBomFile(file)
      setResult(parsed)
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

  const previewRows = result?.lines.slice(0, 8) ?? []
  const totalQty = result?.lines.reduce((s, l) => s + l.qty, 0) ?? 0

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
              <h3 className="text-sm font-bold">{title}</h3>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
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
          {/* Name / version label */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {nameLabel}
            </label>
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder={namePlaceholder}
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
              {fileName || "Drop your BOM file here or click to browse"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Expected columns: Type, Name, Part Number, Solder Type, Footprint, Quantity
            </div>
          </button>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {/* Parsed preview */}
          {result && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-xs">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="font-semibold text-foreground">
                  {result.lines.length} components
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {totalQty.toLocaleString()} total parts
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">sheet “{result.sheetName}”</span>
                {result.skippedRows > 0 && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">
                      {result.skippedRows} blank rows skipped
                    </span>
                  </>
                )}
              </div>

              {/* Column mapping */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold text-muted-foreground/70 tracking-wider">
                  Detected Column Mapping
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PREVIEW_FIELDS.map((f) => {
                    const src = result.mapping[f]
                    return (
                      <span
                        key={f}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium ${
                          src
                            ? "border-primary/25 bg-primary/5 text-foreground"
                            : "border-border bg-muted/40 text-muted-foreground/60"
                        }`}
                      >
                        <span className="font-bold">{BOM_FIELD_LABELS[f]}</span>
                        <span className="text-muted-foreground">←</span>
                        <span className="font-mono">{src ?? "—"}</span>
                      </span>
                    )
                  })}
                </div>
              </div>

              {/* Row preview */}
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-muted/40 text-muted-foreground border-b border-border text-[10px] uppercase font-bold">
                    <tr>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2 min-w-[160px]">Name</th>
                      <th className="px-3 py-2">Part Number</th>
                      <th className="px-3 py-2">Solder</th>
                      <th className="px-3 py-2">Footprint</th>
                      <th className="px-3 py-2 text-center">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewRows.map((l, i) => (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="px-3 py-2 text-muted-foreground">{l.type || "—"}</td>
                        <td className="px-3 py-2 font-semibold text-foreground">{l.name || "—"}</td>
                        <td className="px-3 py-2 font-mono text-primary">{l.partNumber || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{l.solderType || "—"}</td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{l.footprint || "—"}</td>
                        <td className="px-3 py-2 text-center font-mono font-bold text-primary">{l.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.lines.length > previewRows.length && (
                <p className="text-[11px] text-muted-foreground text-center">
                  + {result.lines.length - previewRows.length} more rows
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!result || busy}
            onClick={() =>
              result &&
              onApply(result, productName.trim() || defaultProductName || "Imported Assembly", fileName)
            }
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
