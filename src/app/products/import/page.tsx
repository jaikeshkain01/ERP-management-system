"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DragScrollArea } from "@/components/ui/drag-scroll-area"
import { CategoryCascade } from "@/components/category-cascade"
import { useData } from "@/lib/data-provider"
import { parseBomWorkbook, type ImportedPcb } from "@/lib/bom-import"
import { Upload, AlertTriangle, CheckCircle2, Layers } from "lucide-react"

interface Row {
  category: string // category node id ("" = uncategorised)
  name: string
  genericPN: string
  mpn: string
  manufacturer: string
  solderType: string
  footprint: string
  qty: number
  reference: string
}

const clean = (s: string) => s.replace(/\.0+$/, "").trim() // strip Excel's trailing ".0"

export default function BomImportReviewPage() {
  const d = useData()
  const [sheets, setSheets] = React.useState<ImportedPcb[]>([])
  const [rowsBySheet, setRowsBySheet] = React.useState<Row[][]>([])
  const [active, setActive] = React.useState(0)
  const [fileName, setFileName] = React.useState("")
  const [error, setError] = React.useState("")

  // Existing catalog keys for New-vs-Linked detection.
  const { genericSet, mpnSet, typeToCat } = React.useMemo(() => {
    const g = new Set(d.COMPONENTS.map((c) => c.genericPN?.toLowerCase()).filter(Boolean))
    const m = new Set<string>()
    d.COMPONENTS.forEach((c) => c.brandVariants.forEach((v) => v.partNo && m.add(v.partNo.toLowerCase())))
    const t = new Map<string, string>() // lowercased category name -> id (leaf preferred)
    for (const c of [...d.ITEM_CATEGORIES].sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0)))
      t.set(c.name.toLowerCase(), c.id)
    return { genericSet: g, mpnSet: m, typeToCat: t }
  }, [d])

  const onFile = async (file?: File) => {
    if (!file) return
    setError("")
    try {
      const { pcbs } = await parseBomWorkbook(file)
      const boards = pcbs.filter((p) => p.isBom && !p.isRollup)
      if (!boards.length) return setError("No board sheets found (only rollup/summary sheets).")
      setFileName(file.name)
      setSheets(boards)
      setRowsBySheet(
        boards.map((b) =>
          b.lines.map((l) => ({
            category: typeToCat.get(l.type.trim().toLowerCase()) ?? "",
            name: clean(l.name),
            genericPN: clean(l.genericPartNumber ?? ""),
            mpn: clean(l.partNumber),
            manufacturer: clean(l.manufacturer),
            solderType: l.solderType.trim(),
            footprint: clean(l.footprint),
            qty: l.qty,
            reference: l.reference.trim(),
          })),
        ),
      )
      setActive(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse file.")
    }
  }

  const [importing, setImporting] = React.useState(false)
  const [result, setResult] = React.useState<string>("")

  const doImport = async () => {
    setImporting(true)
    setResult("")
    try {
      const payload = {
        rows: rowsBySheet.flat().map((r) => ({
          categoryId: r.category || undefined,
          name: r.name,
          genericPN: r.genericPN,
          mpn: r.mpn,
          manufacturer: r.manufacturer,
          solderType: r.solderType,
          footprint: r.footprint,
        })),
      }
      const res = await fetch("/api/bom-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      const body = await res.json().catch(() => null)
      if (!res.ok) setResult(body?.error?.message ?? "Import failed")
      else { const r = body.data; setResult(`Imported: ${r.created} created, ${r.linked} linked, ${r.skipped} skipped.`); d.reload() }
    } finally {
      setImporting(false)
    }
  }

  const rows = rowsBySheet[active] ?? []
  const setRow = (i: number, patch: Partial<Row>) =>
    setRowsBySheet((prev) => prev.map((rs, s) => (s === active ? rs.map((r, ri) => (ri === i ? { ...r, ...patch } : r)) : rs)))

  const statusOf = (r: Row): "Linked" | "New" => {
    if (r.genericPN && genericSet.has(r.genericPN.toLowerCase())) return "Linked"
    if (r.mpn && mpnSet.has(r.mpn.toLowerCase())) return "Linked"
    return "New"
  }
  const isInvalid = (r: Row) => statusOf(r) === "New" && !r.genericPN.trim() && !r.mpn.trim()

  const issuesBySheet = rowsBySheet.map((rs) => rs.filter(isInvalid).length)
  const totalIssues = issuesBySheet.reduce((a, b) => a + b, 0)
  const totalNew = rowsBySheet.flat().filter((r) => statusOf(r) === "New").length
  const totalLinked = rowsBySheet.flat().length - totalNew

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <div className="text-sm text-muted-foreground">Products / Import BOM</div>
        <h1 className="text-3xl font-extrabold tracking-tight">BOM Import Review</h1>
        <p className="text-muted-foreground">Upload a multi-sheet BOM, review &amp; fix each board, then import. Every new part needs at least one part number.</p>
      </div>

      {/* Upload */}
      <Card className="border border-border">
        <CardContent className="p-6 flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold cursor-pointer hover:bg-muted/40">
            <Upload className="h-4 w-4" /> Choose BOM file (.xlsx)
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
          {error && <span className="text-sm font-semibold text-destructive">{error}</span>}
        </CardContent>
      </Card>

      {sheets.length > 0 && (
        <>
          {/* Summary */}
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-lg border border-border px-3 py-1.5 font-semibold">{sheets.length} boards</span>
            <span className="rounded-lg border border-border px-3 py-1.5 font-semibold">{totalNew} new</span>
            <span className="rounded-lg border border-border px-3 py-1.5 font-semibold">{totalLinked} linked</span>
            <span className={`rounded-lg border px-3 py-1.5 font-bold ${totalIssues ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}>
              {totalIssues ? `${totalIssues} need a part number` : "No issues"}
            </span>
          </div>

          {/* Sheet tabs */}
          <div className="flex flex-wrap gap-1.5 border-b border-border">
            {sheets.map((s, i) => (
              <button
                key={s.sheetName}
                onClick={() => setActive(i)}
                className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  i === active ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                {s.name}
                {issuesBySheet[i] > 0 && <span className="ml-1 rounded-full bg-destructive px-1.5 text-[10px] font-bold text-white">{issuesBySheet[i]}</span>}
              </button>
            ))}
          </div>

          {/* Editable grid */}
          <Card className="border border-border overflow-hidden">
            <CardHeader className="border-b border-border bg-muted/20 px-6 py-3">
              <CardTitle className="text-base font-bold">{sheets[active].name} — {rows.length} lines</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DragScrollArea className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px] border-b border-border">
                    <tr>
                      {["Category", "Name", "Generic PN", "Mfr PN", "Manufacturer", "Solder", "Footprint", "Qty", "Ref", "Status"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-bold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((r, i) => {
                      const st = statusOf(r)
                      const bad = isInvalid(r)
                      return (
                        <tr key={i} className={bad ? "bg-destructive/5" : "hover:bg-muted/10"}>
                          <td className="px-3 py-1.5 min-w-[220px]"><CategoryCascade value={r.category} onChange={(id) => setRow(i, { category: id })} allLabel="— Uncategorised —" /></td>
                          <td className="px-3 py-1.5 min-w-[140px]"><Input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} className="h-7 text-xs" /></td>
                          <td className="px-3 py-1.5 min-w-[120px]"><Input value={r.genericPN} onChange={(e) => setRow(i, { genericPN: e.target.value })} className={`h-7 text-xs font-mono ${bad ? "border-destructive ring-1 ring-destructive" : ""}`} placeholder={bad ? "required" : ""} /></td>
                          <td className="px-3 py-1.5 min-w-[120px]"><Input value={r.mpn} onChange={(e) => setRow(i, { mpn: e.target.value })} className={`h-7 text-xs font-mono ${bad ? "border-destructive ring-1 ring-destructive" : ""}`} placeholder={bad ? "required" : ""} /></td>
                          <td className="px-3 py-1.5 min-w-[120px]"><Input value={r.manufacturer} onChange={(e) => setRow(i, { manufacturer: e.target.value })} className="h-7 text-xs" /></td>
                          <td className="px-3 py-1.5"><Input value={r.solderType} onChange={(e) => setRow(i, { solderType: e.target.value })} className="h-7 w-16 text-xs" /></td>
                          <td className="px-3 py-1.5 min-w-[100px]"><Input value={r.footprint} onChange={(e) => setRow(i, { footprint: e.target.value })} className="h-7 text-xs" /></td>
                          <td className="px-3 py-1.5"><Input type="number" value={r.qty} onChange={(e) => setRow(i, { qty: Number(e.target.value) })} className="h-7 w-14 text-xs" /></td>
                          <td className="px-3 py-1.5 max-w-[140px] truncate text-muted-foreground" title={r.reference}>{r.reference}</td>
                          <td className="px-3 py-1.5">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${st === "Linked" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-primary/10 text-primary"}`}>{st}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </DragScrollArea>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            {totalIssues > 0 ? (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-destructive"><AlertTriangle className="h-4 w-4" /> Fix {totalIssues} missing part number{totalIssues > 1 ? "s" : ""} to import</span>
            ) : (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Ready to import</span>
            )}
            <Button disabled={totalIssues > 0 || importing} className="font-bold" onClick={doImport}>
              {importing ? "Importing…" : `Import ${totalNew} items`}
            </Button>
          </div>
          {result && <div className="text-right text-sm font-semibold text-emerald-600 dark:text-emerald-400">{result}</div>}
        </>
      )}
    </div>
  )
}
