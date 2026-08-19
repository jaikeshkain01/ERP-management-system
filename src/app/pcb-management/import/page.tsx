"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DragScrollArea } from "@/components/ui/drag-scroll-area"
import { CategoryCascade } from "@/components/category-cascade"
import { useData } from "@/lib/data-provider"
import { parseBomWorkbook, type ImportedPcb } from "@/lib/bom-import"
import { extractError } from "@/lib/api-error"
import { Upload, AlertTriangle, CheckCircle2, Layers, Cpu, CircuitBoard, Package } from "lucide-react"

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

export default function PcbBomImportPage() {
  const d = useData()
  const router = useRouter()
  const [sheets, setSheets] = React.useState<ImportedPcb[]>([])
  const [rowsBySheet, setRowsBySheet] = React.useState<Row[][]>([])
  const [active, setActive] = React.useState(0)
  const [fileName, setFileName] = React.useState("")
  const [productName, setProductName] = React.useState("")
  // Same product-header fields as the "Add Manually" flow — kept in sync
  // so a BOM-imported product carries the same metadata as a hand-built one.
  const [productCode, setProductCode] = React.useState("")
  const [productVersion, setProductVersion] = React.useState("v1")
  const [productDescription, setProductDescription] = React.useState("")
  const [error, setError] = React.useState("")
  // Two shapes to import into: wrap the PCBs in a product, or drop them into
  // the PCB catalog as standalone boards. The item catalog is populated either way.
  const [mode, setMode] = React.useState<"product" | "pcb-only">("product")
  // Sheet indexes the user has opted OUT of importing (rollup/summary tabs that
  // slipped past auto-filter, revisions of a board they don't want, etc.).
  const [excluded, setExcluded] = React.useState<Set<number>>(new Set())

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
      // Default the product name from the file if the user hasn't typed one.
      if (!productName.trim()) setProductName(file.name.replace(/\.[^.]+$/, ""))
      setSheets(boards)
      setExcluded(new Set()) // fresh workbook → include everything by default
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
  const [result, setResult] = React.useState<{ message: string; hint?: string; tone: "success" | "error" } | null>(null)

  const doImport = async () => {
    if (mode === "product" && !productName.trim()) {
      setResult({ message: "Enter a product name — the imported PCBs will belong to that product.", tone: "error" })
      return
    }
    setImporting(true)
    setResult(null)
    try {
      // Only sheets the user hasn't excluded contribute — for BOTH the item-catalog
      // import and the PCB/product creation that follows.
      const includedIdx = sheets.map((_, i) => i).filter((i) => !excluded.has(i))
      if (includedIdx.length === 0) {
        setResult({ message: "No sheets selected — tick at least one board to import.", tone: "error" })
        return
      }

      // Step 1 — populate the item catalog (respects per-row category / solder / footprint).
      // Runs in both modes so the PCB BOM lines below resolve to existing components.
      const flatPayload = {
        rows: includedIdx.flatMap((i) => rowsBySheet[i]).map((r) => ({
          categoryId: r.category || undefined,
          name: r.name,
          genericPN: r.genericPN,
          mpn: r.mpn,
          manufacturer: r.manufacturer,
          solderType: r.solderType,
          footprint: r.footprint,
        })),
      }
      const compRes = await fetch("/api/bom-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flatPayload),
      })
      const compBody = await compRes.json().catch(() => null)
      if (!compRes.ok) {
        const err = extractError(compBody, "Failed to import components")
        setResult({ ...err, tone: "error" })
        return
      }
      const compStats = compBody.data as { created: number; linked: number; skipped: number }

      // Line builder shared by both modes — each row becomes a BOM line whose
      // component is resolved server-side by MPN (existing) or created on the fly.
      const linesFor = (sheetIdx: number) =>
        rowsBySheet[sheetIdx].map((r) => ({
          name: r.name || undefined,
          partNumber: r.mpn || undefined,
          solderType: r.solderType === "SMD" || r.solderType === "DIP" ? r.solderType : undefined,
          footprint: r.footprint || undefined,
          qty: r.qty,
          refDes: r.reference || undefined,
          manufacturer: r.manufacturer || undefined,
        }))

      if (mode === "product") {
        // Step 2a — create the product with each INCLUDED sheet as its own PCB.
        // Header fields mirror the manual "Add Product" flow; description falls back
        // to a "Imported from …" auto-note when the user leaves it blank.
        const description = productDescription.trim() || `Imported from ${fileName}`
        const prodRes = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            name: productName.trim(),
            code: productCode.trim() || undefined,
            versionLabel: productVersion.trim() || undefined,
            description,
            pcbs: includedIdx.map((i) => ({
              name: sheets[i].name || sheets[i].sheetName || `Board ${i + 1}`,
              qty: 1,
              lines: linesFor(i),
            })),
          }),
        })
        const prodBody = await prodRes.json().catch(() => null)
        if (!prodRes.ok) {
          setResult({ ...extractError(prodBody, "Failed to create product"), tone: "error" })
          return
        }
        const created = prodBody.data as { slug: string }
        await d.reload()
        setResult({
          message: `Product "${productName.trim()}" created with ${includedIdx.length} PCB${includedIdx.length === 1 ? "" : "s"}.`,
          hint: `${compStats.created} new item${compStats.created === 1 ? "" : "s"} added, ${compStats.linked} linked to existing.`,
          tone: "success",
        })
        setTimeout(() => router.push(`/products/structure?product=${created.slug}`), 900)
      } else {
        // Step 2b — create each INCLUDED sheet as a standalone PCB in the PCB catalog.
        const results = await Promise.allSettled(
          includedIdx.map((i) =>
            fetch("/api/pcbs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify({
                name: sheets[i].name || sheets[i].sheetName || `Board ${i + 1}`,
                description: `Imported from ${fileName}`,
                status: "Active",
                lines: linesFor(i),
              }),
            }).then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => null), sheetIdx: i }))
          )
        )
        const failed = results
          .map((r) => (r.status === "fulfilled" && !r.value.ok ? { name: sheets[r.value.sheetIdx].name || sheets[r.value.sheetIdx].sheetName, err: extractError(r.value.body, "Failed") } : null))
          .filter((x): x is { name: string; err: { message: string; hint?: string } } => x !== null)
        const rejected = results.filter((r) => r.status === "rejected").length
        const okCount = results.length - failed.length - rejected
        if (failed.length || rejected) {
          setResult({
            message: `Imported ${okCount} of ${includedIdx.length} PCB${includedIdx.length === 1 ? "" : "s"}${failed.length ? ` — ${failed.length} failed` : ""}${rejected ? `, ${rejected} network error${rejected === 1 ? "" : "s"}` : ""}.`,
            hint: failed[0] ? `${failed[0].name}: ${failed[0].err.message}${failed[0].err.hint ? ` — ${failed[0].err.hint}` : ""}` : undefined,
            tone: "error",
          })
          if (okCount > 0) await d.reload()
          return
        }
        await d.reload()
        setResult({
          message: `${okCount} standalone PCB${okCount === 1 ? "" : "s"} imported into the PCB catalog.`,
          hint: `${compStats.created} new item${compStats.created === 1 ? "" : "s"} added, ${compStats.linked} linked to existing.`,
          tone: "success",
        })
        setTimeout(() => router.push("/pcb-management/list"), 900)
      }
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
  // Roll-ups only count sheets the user is actually importing — excluding a
  // rollup/summary sheet with garbage rows shouldn't block a valid import.
  const includedRows = rowsBySheet.filter((_, i) => !excluded.has(i)).flat()
  const totalIssues = rowsBySheet.reduce((a, rs, i) => a + (excluded.has(i) ? 0 : rs.filter(isInvalid).length), 0)
  const totalNew = includedRows.filter((r) => statusOf(r) === "New").length
  const totalLinked = includedRows.length - totalNew
  const includedCount = sheets.length - excluded.size

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <div className="text-sm text-muted-foreground">PCB Management / Import BOM</div>
        <h1 className="text-3xl font-extrabold tracking-tight">BOM Import Review</h1>
        <p className="text-muted-foreground">
          Upload a multi-sheet BOM. Choose whether to wrap the tabs into a product or drop them into the PCB catalog as standalone boards. Every new part needs at least one part number.
        </p>
      </div>

      {/* Mode selector — segmented control */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setMode("product")}
          className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
            mode === "product"
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-border bg-background hover:border-primary/40"
          }`}
        >
          <Package className={`h-5 w-5 mt-0.5 shrink-0 ${mode === "product" ? "text-primary" : "text-muted-foreground"}`} />
          <div className="min-w-0">
            <div className="text-sm font-bold">Create product with PCBs</div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Each sheet becomes a PCB inside one new product. Best when the BOM represents a complete assembly.</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setMode("pcb-only")}
          className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
            mode === "pcb-only"
              ? "border-primary bg-primary/5 shadow-sm"
              : "border-border bg-background hover:border-primary/40"
          }`}
        >
          <CircuitBoard className={`h-5 w-5 mt-0.5 shrink-0 ${mode === "pcb-only" ? "text-primary" : "text-muted-foreground"}`} />
          <div className="min-w-0">
            <div className="text-sm font-bold">Import PCBs only</div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Each sheet becomes a standalone PCB in the catalog — no product is created. Wrap them into a product later if needed.</p>
          </div>
        </button>
      </div>

      {/* Upload */}
      <Card className="border border-border">
        <CardContent className="p-6 flex flex-wrap items-center gap-4">
          <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold cursor-pointer hover:bg-muted/40">
            <Upload className="h-4 w-4" /> Choose BOM file (.xlsx)
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
          {error && <span className="text-sm font-semibold text-destructive w-full">{error}</span>}
        </CardContent>
      </Card>

      {/* Product details — only when wrapping the PCBs in a product. */}
      {mode === "product" && sheets.length > 0 && (
        <Card className="border border-border">
          <CardHeader className="border-b border-border bg-muted/20 px-6 py-3">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-bold">Product details</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Name<span className="text-destructive">*</span>
              </label>
              <Input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. Router X1"
                className="h-9 text-sm"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Code</label>
              <Input
                value={productCode}
                onChange={(e) => setProductCode(e.target.value)}
                placeholder="e.g. RTR-X1"
                className="h-9 text-sm font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Version</label>
              <Input
                value={productVersion}
                onChange={(e) => setProductVersion(e.target.value)}
                placeholder="v1"
                className="h-9 text-sm font-mono"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Description</label>
              <Input
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                placeholder={`Blank → "Imported from ${fileName}"`}
                className="h-9 text-sm"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {sheets.length > 0 && (
        <>
          {/* Summary */}
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-lg border border-border px-3 py-1.5 font-semibold">
              {includedCount} of {sheets.length} PCB{sheets.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-lg border border-border px-3 py-1.5 font-semibold">{totalNew} new items</span>
            <span className="rounded-lg border border-border px-3 py-1.5 font-semibold">{totalLinked} linked</span>
            <span className={`rounded-lg border px-3 py-1.5 font-bold ${totalIssues ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}>
              {totalIssues ? `${totalIssues} need a part number` : "No issues"}
            </span>
          </div>

          {/* Sheet tabs — checkbox toggles inclusion, name/badge switches the active view. */}
          <div className="flex flex-wrap gap-1.5 border-b border-border">
            {sheets.map((s, i) => {
              const isExcluded = excluded.has(i)
              return (
                <div
                  key={s.sheetName}
                  className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    i === active
                      ? "bg-primary/10 text-primary border-b-2 border-primary"
                      : isExcluded
                        ? "text-muted-foreground/50 line-through"
                        : "text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!isExcluded}
                    onChange={(e) => {
                      setExcluded((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.delete(i)
                        else next.add(i)
                        return next
                      })
                    }}
                    className="h-3.5 w-3.5 rounded border-border text-primary cursor-pointer"
                    title={isExcluded ? "Include this sheet" : "Skip this sheet on import"}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    className="flex items-center gap-1.5 cursor-pointer"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    {s.name}
                    {issuesBySheet[i] > 0 && !isExcluded && (
                      <span className="ml-1 rounded-full bg-destructive px-1.5 text-[10px] font-bold text-white">{issuesBySheet[i]}</span>
                    )}
                  </button>
                </div>
              )
            })}
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
            <Button
              disabled={totalIssues > 0 || importing || includedCount === 0 || (mode === "product" && !productName.trim())}
              className="font-bold"
              onClick={doImport}
            >
              {importing
                ? "Importing…"
                : mode === "product"
                  ? `Create product with ${includedCount} PCB${includedCount === 1 ? "" : "s"}`
                  : `Import ${includedCount} PCB${includedCount === 1 ? "" : "s"} into catalog`}
            </Button>
          </div>

          {result && (
            <div className={`rounded-lg border px-4 py-3 bg-background ${
              result.tone === "success"
                ? "border-emerald-500/35 text-emerald-600 dark:text-emerald-400"
                : "border-destructive/35 text-destructive"
            }`}>
              <div className="text-sm font-semibold">{result.message}</div>
              {result.hint && <div className="mt-1 text-xs font-medium text-muted-foreground">{result.hint}</div>}
            </div>
          )}
        </>
      )}
    </div>
  )
}
