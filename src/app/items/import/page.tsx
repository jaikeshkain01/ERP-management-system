"use client"

/**
 * BOM Import (full-page, Slice C/D redesign).
 *
 * Ports the retired /pcb-management/import experience onto the Universal Item
 * model: one workbook → N assembled/semi-assembled items, each with its own
 * child-item BOM lines. The user gets the same level of control the old page
 * had — per-sheet include/exclude, per-row edit of every field, per-row
 * Linked/New status, and per-sheet issue counters that block a bad import.
 *
 * Flow per included sheet:
 *   1. POST /api/items   → create the parent (assembled or semi_assembled)
 *   2. POST /api/items/{parentId}/bom-import   → Slice B does the row work
 *   3. Move to the next sheet
 *
 * Runs SEQUENTIALLY so a part that appears on two boards is created once by
 * the first sheet and matched by the second — the Slice B endpoint's (brand,
 * part_no) dedup key handles the reuse.
 *
 * Entry points:
 *   • "Import BOM" button on the add-item form → carries `?stage=…` here.
 *   • "Import BOM" button on the items list toolbar.
 */

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DragScrollArea } from "@/components/ui/drag-scroll-area"
import { CategoryCascade } from "@/components/category-cascade"
import { useData } from "@/lib/data-provider"
import { parseBomWorkbook, type ImportedPcb } from "@/lib/bom-import"
import { extractError } from "@/lib/api-error"
import { writeStagedBom, type StagedBomRow } from "@/lib/item-form-draft"
import {
  Upload, AlertTriangle, CheckCircle2, Layers, ArrowLeft,
  Loader2, Info, X, Package, Cpu,
} from "lucide-react"

type Stage = "assembled" | "semi_assembled"

interface Row {
  categoryId: string
  name: string
  partNo: string
  manufacturer: string
  supplier: string
  solderType: string
  footprint: string
  qty: number
  ref: string
}

interface SheetState {
  sheetName: string
  isRollup: boolean
  parentName: string
  parentCode: string
  parentStage: Stage
  parentCategoryId: string
  rows: Row[]
}

interface ImportProgress {
  sheetIndex: number
  phase: "creating-item" | "importing-bom" | "done" | "error"
  message?: string
  /** Chunked-import progress (Fix 3). `rowsTotal` is only the importable
   *  rows for that sheet — invalid rows are excluded before chunking. */
  rowsDone?: number
  rowsTotal?: number
}

// Chunk size for the sheet-import loop. Small enough to keep progress
// feedback lively (~1 tick per second on typical DBs), big enough that
// upload overhead per batch stays negligible.
const IMPORT_CHUNK_SIZE = 250

interface ImportResult {
  parentItemId: string
  parentCode: string
  bomVersionId: string
  linesCreated: number
  itemsCreated: number
  itemsMatched: number
  brandsCreated: number
  suppliersCreated: number
  skipped: number
  /** true when the parent item already existed and the BOM landed as a new
   *  version (v2, v3…) on it instead of creating a fresh item. */
  parentReused: boolean
}

// sessionStorage draft — serialised shape (Sets → arrays for JSON).
interface SavedDraft {
  version: 1
  fileName: string
  sheets: SheetState[]
  excluded: number[]
  active: number
  savedAt: string
}

const DRAFT_KEY = "bom-import-draft:v1"

function loadDraft(): SavedDraft | null {
  try {
    const raw = typeof window === "undefined" ? null : window.sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SavedDraft
    if (parsed?.version !== 1 || !Array.isArray(parsed.sheets)) return null
    return parsed
  } catch {
    return null
  }
}

function saveDraft(d: Omit<SavedDraft, "version" | "savedAt">): void {
  try {
    if (typeof window === "undefined") return
    const payload: SavedDraft = { ...d, version: 1, savedAt: new Date().toISOString() }
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(payload))
  } catch {
    // Quota, private-mode, or serialisation failure — silently drop the
    // save. The in-memory state is still correct; only auto-recovery is
    // affected, and the UX degrades to "reload = re-parse" (matches pre-Fix-2).
  }
}

function clearDraft(): void {
  try {
    if (typeof window === "undefined") return
    window.sessionStorage.removeItem(DRAFT_KEY)
  } catch { /* see saveDraft */ }
}

function relativeAge(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return "moments ago"
  const secs = Math.max(1, Math.round((Date.now() - then) / 1000))
  if (secs < 60) return `${secs}s ago`
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  return `${hrs} h ago`
}

const STAGE_META: Record<Stage, { label: string; icon: React.ComponentType<{ className?: string }>; codePrefix: string }> = {
  assembled:      { label: "Assembled",      icon: Package, codePrefix: "FG"  },
  semi_assembled: { label: "Semi-assembled", icon: Cpu,     codePrefix: "SUB" },
}

// Sheet-name → item-code slug. Matches the shape used elsewhere so imported
// items look native alongside hand-added ones.
function suggestParentCode(sheetName: string, stage: Stage): string {
  const namePart = sheetName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24)
  if (!namePart) return ""
  return `${STAGE_META[stage].codePrefix}-${namePart}`
}

// Strip Excel's trailing ".0" on numeric part-numbers stored as floats.
const clean = (s: string) => String(s ?? "").replace(/\.0+$/, "").trim()

// Best-effort category match from the sheet's Type column (e.g. "Capacitor"
// → the leaf named "Capacitors" or "Capacitor" in the catalog).
function guessCategory(typeName: string, byLowerName: Map<string, string>): string {
  const norm = typeName.trim().toLowerCase()
  if (!norm) return ""
  return byLowerName.get(norm) ?? byLowerName.get(norm + "s") ?? byLowerName.get(norm.replace(/s$/, "")) ?? ""
}

export default function BomImportPage() {
  return (
    <React.Suspense fallback={null}>
      <BomImport />
    </React.Suspense>
  )
}

function BomImport() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const d = useData()

  // Default stage is honoured when the user came from the add-form (which
  // passes ?stage=assembled|semi_assembled). Anywhere else, assume assembled.
  const initialStage: Stage =
    searchParams.get("stage") === "semi_assembled" ? "semi_assembled" : "assembled"

  // Attach mode: the caller (usually the add-item form's "Import BOM" button)
  // has already created the parent item and hands us its id via `?parentId`.
  // In this mode the workbook attaches ONE sheet to that existing item — the
  // sheet-name-derived parent name/code UI is hidden and the multi-sheet
  // include tabs collapse to single-select. After a successful import we
  // bounce back to /items/edit/<parentId>?bomImported=1 (returnTo=edit) so
  // the user sees their entered details and a "BOM imported" banner.
  const parentId = searchParams.get("parentId") || ""
  const returnTo = searchParams.get("returnTo") || ""
  const attachMode = Boolean(parentId)
  // Stage mode: the add-item form sent the user here BEFORE saving the item.
  // The importer parses the workbook, the user reviews and hits "Attach to
  // add-item form" — that writes the reviewed rows to sessionStorage and
  // navigates back to /items/add. Nothing hits the DB in this mode; the
  // real POST happens when the user saves the item on the add page.
  const stageMode = !attachMode && returnTo === "add"
  const [parentInfo, setParentInfo] = React.useState<{
    id: string; code: string; name: string; itemType: string
  } | null>(null)
  React.useEffect(() => {
    if (!attachMode) return
    let cancelled = false
    fetch(`/api/items/${encodeURIComponent(parentId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { data?: { id: string; code: string; name: string; itemType: string } } | null) => {
        if (cancelled || !body?.data) return
        setParentInfo(body.data)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [attachMode, parentId])

  const [fileName, setFileName] = React.useState("")
  const [sheets, setSheets] = React.useState<SheetState[]>([])
  const [excluded, setExcluded] = React.useState<Set<number>>(new Set())
  const [active, setActive] = React.useState(0)
  const [parseError, setParseError] = React.useState<string | null>(null)
  const [dragOver, setDragOver] = React.useState(false)

  const [importing, setImporting] = React.useState(false)
  const [progress, setProgress] = React.useState<ImportProgress[]>([])
  const [results, setResults] = React.useState<ImportResult[]>([])
  const [importErrors, setImportErrors] = React.useState<string[]>([])

  // Draft-save (Fix 2). Every meaningful edit is mirrored to sessionStorage
  // under DRAFT_KEY so a page reload doesn't cost the user their column
  // fixes. On mount we check for a saved draft and show a restore banner —
  // never rehydrate silently, since the user may have moved on. Cleared on
  // successful all-sheets import.
  const [pendingDraft, setPendingDraft] = React.useState<SavedDraft | null>(null)
  const [draftDecided, setDraftDecided] = React.useState(false)

  // Category-name lookup for the auto-mapping heuristic. Only raw-stage
  // categories are eligible — BOM children live under `raw` by default in
  // our model, and the per-row picker is already stage-filtered to raw, so
  // an auto-guessed non-raw id would land in state that the picker can't
  // render. Prefer leaves (nodes with a parent) over roots so "Capacitor"
  // hits the leaf under Passive rather than a bare top-level bucket.
  const byLowerRawName = React.useMemo(() => {
    const map = new Map<string, string>()
    const cats = d.ITEM_CATEGORIES.filter((c) => c.defaultItemType === "raw")
    // Roots first so leaves overwrite; that inverts the desired order — build
    // both passes and prefer whichever came last (leaf).
    cats.sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0))
    for (const c of cats) map.set(c.name.toLowerCase(), c.id)
    return map
  }, [d.ITEM_CATEGORIES])

  // Existing catalog for the Linked/New chip. Fetched once when the page
  // mounts — the volumes are small and we want the chips accurate at parse
  // time. Rebuilds only when the fetch re-runs (never, on this page).
  const [existingItems, setExistingItems] = React.useState<{
    byMpn: Map<string, string>                                  // lower(partNo) → item code (for row Linked/New chips)
    byName: Map<string, string>                                 // lower(name)   → item code (for row Linked/New chips)
    byNameFull: Map<string, { id: string; code: string; name: string }> // parent match → drives version-on-existing
  }>({ byMpn: new Map(), byName: new Map(), byNameFull: new Map() })
  React.useEffect(() => {
    let cancelled = false
    fetch("/api/items", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { data?: Array<{ id: string; code: string; name: string; variants: Array<{ partNo: string | null }> }> } | null) => {
        if (cancelled || !body?.data) return
        const byMpn = new Map<string, string>()
        const byName = new Map<string, string>()
        const byNameFull = new Map<string, { id: string; code: string; name: string }>()
        for (const it of body.data) {
          if (it.name) {
            byName.set(it.name.toLowerCase(), it.code)
            byNameFull.set(it.name.toLowerCase(), { id: it.id, code: it.code, name: it.name })
          }
          for (const v of it.variants) {
            if (v.partNo) byMpn.set(v.partNo.toLowerCase(), it.code)
          }
        }
        setExistingItems({ byMpn, byName, byNameFull })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Draft-save: load once on mount into `pendingDraft` if anything survived
  // in sessionStorage. Never rehydrates automatically — the user chooses
  // Restore or Discard via the banner below. Guarded on `draftDecided` so
  // the first render's autosave effect doesn't clobber the pending draft
  // with the empty initial state.
  React.useEffect(() => {
    const d = loadDraft()
    if (d && Array.isArray(d.sheets) && d.sheets.length > 0) {
      setPendingDraft(d)
    } else {
      setDraftDecided(true)
    }
  }, [])

  // Autosave: mirror the editable state to sessionStorage on every change,
  // but only after the user has resolved any pending draft AND only while a
  // real workbook is loaded (so we don't overwrite the pending draft with
  // an empty payload). Also skip during an import, and skip once results
  // have landed — the finished-import handler clears the draft, and we
  // don't want the re-render triggered by `setImporting(false)` to write
  // it back.
  React.useEffect(() => {
    if (!draftDecided || importing) return
    if (sheets.length === 0) return
    if (results.length > 0) return
    saveDraft({ fileName, sheets, excluded: Array.from(excluded), active })
  }, [draftDecided, importing, fileName, sheets, excluded, active, results.length])

  const restoreDraft = () => {
    if (!pendingDraft) return
    setFileName(pendingDraft.fileName)
    setSheets(pendingDraft.sheets)
    setExcluded(new Set(pendingDraft.excluded))
    setActive(pendingDraft.active)
    setPendingDraft(null)
    setDraftDecided(true)
  }
  const discardDraft = () => {
    clearDraft()
    setPendingDraft(null)
    setDraftDecided(true)
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    // Uploading a new file supersedes any pending restore prompt — the user
    // has clearly opted to start fresh — and unlocks autosave.
    if (pendingDraft) setPendingDraft(null)
    setDraftDecided(true)
    setParseError(null)
    setSheets([])
    setResults([])
    setImportErrors([])
    setProgress([])
    setFileName(file.name)
    try {
      const { pcbs } = await parseBomWorkbook(file)
      if (pcbs.length === 0) {
        setParseError("No sheets found in the workbook.")
        return
      }
      const built: SheetState[] = pcbs.map((p) => buildSheetState(p, initialStage, byLowerRawName))
      setSheets(built)
      // Roll-up tabs (Combined/Summary) stay unticked by default — matches the
      // parser's own signal. Empty tabs are also excluded. In attach mode
      // multiple sheets can still be picked — the importer merges them into
      // the parent's single Draft BOM (first chunk creates it, the rest append).
      const skip = new Set<number>()
      pcbs.forEach((p, i) => { if (!p.isBom || p.isRollup) skip.add(i) })
      setExcluded(skip)
      // Land on the first included sheet, or the first one overall if none.
      const firstIncluded = pcbs.findIndex((p) => p.isBom && !p.isRollup)
      setActive(firstIncluded >= 0 ? firstIncluded : 0)
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Failed to read the file.")
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (importing) return
    const file = e.dataTransfer.files?.[0]
    if (file) void onFile(file)
  }

  const patchSheet = (i: number, patch: Partial<SheetState>) =>
    setSheets((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  const patchRow = (sheetIdx: number, rowIdx: number, patch: Partial<Row>) =>
    setSheets((prev) => prev.map((s, i) => {
      if (i !== sheetIdx) return s
      return { ...s, rows: s.rows.map((r, j) => (j === rowIdx ? { ...r, ...patch } : r)) }
    }))

  const removeRow = (sheetIdx: number, rowIdx: number) =>
    setSheets((prev) => prev.map((s, i) => {
      if (i !== sheetIdx) return s
      return { ...s, rows: s.rows.filter((_, j) => j !== rowIdx) }
    }))

  const toggleExcluded = (i: number) =>
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  // ── derived: status per row + counters ─────────────────────────────────
  // Track (mpn|manufacturer)+name uniqueness WITHIN this batch so we can
  // flag duplicate lines that will merge server-side.
  const statusFor = (r: Row): "Linked" | "New" => {
    if (r.partNo) {
      const hit = existingItems.byMpn.get(r.partNo.toLowerCase())
      if (hit) return "Linked"
    }
    if (r.name) {
      const hit = existingItems.byName.get(r.name.toLowerCase())
      if (hit) return "Linked"
    }
    return "New"
  }

  const isRowInvalid = (r: Row) => !r.name.trim() && !r.partNo.trim()

  const includedSheets = sheets
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => !excluded.has(i))

  const globalCounts = React.useMemo(() => {
    let issues = 0, totalRows = 0
    const perSheetIssues = new Array<number>(sheets.length).fill(0)
    // Cross-sheet dedup: match the server's key so the counters reflect what
    // will actually happen on commit. A part that appears on N boards
    // creates ONE catalog item and N BOM lines — the "new items" chip needs
    // to say 1, not N. When a PN is present, key on (brand, PN-upper,
    // name-lower); when it's missing, fall back to (name, footprint, solder)
    // like the importer's own findItemByBrandAndPartNo / name-fallback.
    const newKeys = new Set<string>()
    const linkedKeys = new Set<string>()
    for (const { s, i } of includedSheets) {
      for (const r of s.rows) {
        totalRows++
        if (isRowInvalid(r)) { issues++; perSheetIssues[i]++; continue }
        const brand = (r.manufacturer.trim().toLowerCase() || "no-manufacturer")
        const pn = r.partNo.trim().toUpperCase()
        const nameKey = r.name.trim().toLowerCase()
        const key = pn
          ? `${brand}|${pn}|${nameKey}`
          : `NP|${nameKey}|${r.footprint.trim().toLowerCase()}|${r.solderType.trim().toUpperCase()}`
        if (statusFor(r) === "Linked") linkedKeys.add(key)
        else newKeys.add(key)
      }
    }
    return {
      newItems: newKeys.size,
      linked: linkedKeys.size,
      issues,
      totalRows,
      perSheetIssues,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheets, excluded, existingItems])

  const canImport =
    !importing &&
    includedSheets.length > 0 &&
    globalCounts.issues === 0 &&
    // Attach and stage modes both defer parent identity — no name/code check.
    // Attach uses the URL's parentId; stage carries the rows back to the
    // add-item form which supplies name/code at final save time.
    (attachMode || stageMode || includedSheets.every(({ s }) => s.parentName.trim() && s.parentCode.trim()))

  // ── stage-mode handoff ─────────────────────────────────────────────────
  // Serialise the reviewed rows into sessionStorage and go back to the
  // add-item form. No API call — the form's own submit does the commit.
  const doStage = () => {
    const rows: StagedBomRow[] = []
    const sheetSummary: { sheetName: string; rowCount: number }[] = []
    for (const { s } of includedSheets) {
      let kept = 0
      for (const r of s.rows) {
        if (isRowInvalid(r)) continue
        rows.push({
          source: s.sheetName,
          categoryId: r.categoryId || null,
          name: r.name.trim() || r.partNo.trim(),
          partNo: r.partNo.trim() || null,
          manufacturer: r.manufacturer.trim() || null,
          supplier: r.supplier.trim() || null,
          solderType:
            r.solderType.trim().toUpperCase() === "SMD" ? "SMD"
            : r.solderType.trim().toUpperCase() === "DIP" ? "DIP"
            : null,
          footprint: r.footprint.trim() || null,
          qty: Number.isFinite(r.qty) && r.qty > 0 ? r.qty : 1,
          designator: r.ref.trim() || null,
        })
        kept++
      }
      sheetSummary.push({ sheetName: s.sheetName, rowCount: kept })
    }
    writeStagedBom({ fileName, rows, sheetSummary })
    // Also clear the draft-recovery key — the user has moved on.
    clearDraft()
    router.push("/items/add")
  }

  // ── the import loop ────────────────────────────────────────────────────
  const doImport = async () => {
    setImporting(true)
    setResults([])
    setImportErrors([])
    // Seed a progress row per included sheet so the sidebar shows all
    // pending sheets from the start.
    setProgress(includedSheets.map(({ i }) => ({ sheetIndex: i, phase: "creating-item" })))

    const gathered: ImportResult[] = []
    const errs: string[] = []
    // In attach mode every sheet lands on the SAME parent, so only the first
    // successful chunk creates the Draft — everything after appends into it.
    // Reset to false at each sheet in fresh mode (where each sheet has its
    // own new parent).
    let draftCreated = false
    try {
      for (const { s, i } of includedSheets) {
        setProgress((prev) => prev.map((p) => (p.sheetIndex === i ? { ...p, phase: "creating-item" } : p)))
        // 1) Resolve the parent item.
        //    - Attach mode: parent already exists — use the URL id.
        //    - Fresh mode: look up by name first. When a match exists, reuse
        //      that item and let the BOM importer create a new version (v2,
        //      v3…) on it. Only POST /api/items when no match is found.
        let parentIdLocal: string | null = null
        let reusedExisting = false
        if (attachMode) {
          parentIdLocal = parentId
        } else {
          const existingParent = existingItems.byNameFull.get(s.parentName.trim().toLowerCase())
          if (existingParent) {
            parentIdLocal = existingParent.id
            reusedExisting = true
          } else {
            try {
              const iRes = await fetch("/api/items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: s.parentName.trim(),
                  code: s.parentCode.trim(),
                  itemType: s.parentStage,
                  categoryId: s.parentCategoryId || undefined,
                }),
              })
              const iBody = await iRes.json().catch(() => null)
              if (!iRes.ok) {
                const msg = extractError(iBody, "failed to create item").message
                errs.push(`${s.sheetName}: create item — ${msg}`)
                setProgress((prev) => prev.map((p) => (p.sheetIndex === i ? { ...p, phase: "error", message: msg } : p)))
                continue
              }
              parentIdLocal = iBody?.data?.id as string
            } catch (e) {
              const msg = e instanceof Error ? e.message : "network error"
              errs.push(`${s.sheetName}: create item — ${msg}`)
              setProgress((prev) => prev.map((p) => (p.sheetIndex === i ? { ...p, phase: "error", message: msg } : p)))
              continue
            }
          }
        }

        // 2) Import the BOM rows against the fresh parent — chunked so a
        //    large sheet reports per-batch progress instead of blocking the
        //    UI on one giant POST. First batch uses mode='create' (which the
        //    server also treats as the default), subsequent batches append
        //    into the Draft the first batch produced.
        setProgress((prev) => prev.map((p) => (p.sheetIndex === i ? { ...p, phase: "importing-bom" } : p)))
        try {
          const importableRows = s.rows
            .filter((r) => !isRowInvalid(r))
            .map((r) => ({
              name: r.name.trim() || r.partNo.trim(),
              partNo: r.partNo.trim() || null,
              manufacturer: r.manufacturer.trim() || null,
              supplier: r.supplier.trim() || null,
              designator: r.ref.trim() || null,
              solderType:
                r.solderType.trim().toUpperCase() === "SMD"
                  ? "SMD"
                  : r.solderType.trim().toUpperCase() === "DIP"
                    ? "DIP"
                    : null,
              footprint: r.footprint.trim() || null,
              qty: Number.isFinite(r.qty) && r.qty > 0 ? r.qty : 1,
              categoryId: r.categoryId || null,
            }))

          const totalRows = importableRows.length
          setProgress((prev) => prev.map((p) => (
            p.sheetIndex === i ? { ...p, rowsDone: 0, rowsTotal: totalRows } : p
          )))

          // Batch accumulator — we sum per-batch counts to report one line
          // per sheet in the final result summary.
          const agg = {
            bomVersionId: "",
            linesCreated: 0, itemsCreated: 0, itemsMatched: 0,
            brandsCreated: 0, suppliersCreated: 0, skipped: 0,
          }
          let batchError: string | null = null

          // Fresh mode: each sheet gets a brand-new parent, so its first
          // chunk always creates the Draft. Attach mode: one shared parent —
          // the very first chunk (across all sheets) creates the Draft, the
          // rest append.
          if (!attachMode) draftCreated = false
          for (let cursor = 0; cursor < totalRows; cursor += IMPORT_CHUNK_SIZE) {
            const chunk = importableRows.slice(cursor, cursor + IMPORT_CHUNK_SIZE)
            const mode = draftCreated ? "append" : "create"
            const bRes = await fetch(`/api/items/${parentIdLocal}/bom-import`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                rows: chunk,
                mode,
                sourceLabel: `${fileName} / ${s.sheetName}`,
              }),
            })
            const bBody = await bRes.json().catch(() => null)
            if (!bRes.ok) {
              batchError = extractError(bBody, "failed to import BOM").message
              break
            }
            const r = bBody.data as {
              bomVersionId: string; linesCreated: number; itemsCreated: number
              itemsMatched: number; brandsCreated: number; suppliersCreated: number
              skipped: Array<unknown>
            }
            agg.bomVersionId = r.bomVersionId
            draftCreated = true
            agg.linesCreated += r.linesCreated
            agg.itemsCreated += r.itemsCreated
            agg.itemsMatched += r.itemsMatched
            agg.brandsCreated += r.brandsCreated
            agg.suppliersCreated += r.suppliersCreated
            agg.skipped += r.skipped.length
            const done = Math.min(cursor + chunk.length, totalRows)
            setProgress((prev) => prev.map((p) => (
              p.sheetIndex === i ? { ...p, rowsDone: done, rowsTotal: totalRows } : p
            )))
          }

          if (batchError) {
            errs.push(`${s.sheetName}: BOM import — ${batchError}`)
            setProgress((prev) => prev.map((p) => (p.sheetIndex === i ? { ...p, phase: "error", message: batchError! } : p)))
            continue
          }

          // Activate the freshly-imported Draft so it shows up as Active
          // on /products/list and /pcb-management/list right away.
          // Attach mode is trickier — multiple sheets can fold into the
          // same parent's Draft, so we defer activation until the loop
          // finishes (see the post-loop pass below).
          if (!attachMode && agg.bomVersionId) {
            try {
              await fetch(`/api/items/${parentIdLocal}/bom/${agg.bomVersionId}/activate`, { method: "POST" })
            } catch { /* non-fatal — user can activate manually from the BOM editor */ }
          }

          gathered.push({
            parentItemId: parentIdLocal!,
            parentCode: attachMode
              ? (parentInfo?.code ?? "")
              : reusedExisting
                ? (existingItems.byNameFull.get(s.parentName.trim().toLowerCase())?.code ?? s.parentCode.trim())
                : s.parentCode.trim(),
            bomVersionId: agg.bomVersionId,
            linesCreated: agg.linesCreated,
            itemsCreated: agg.itemsCreated,
            itemsMatched: agg.itemsMatched,
            brandsCreated: agg.brandsCreated,
            suppliersCreated: agg.suppliersCreated,
            skipped: agg.skipped,
            parentReused: reusedExisting,
          })
          setProgress((prev) => prev.map((p) => (p.sheetIndex === i ? { ...p, phase: "done" } : p)))
        } catch (e) {
          const msg = e instanceof Error ? e.message : "network error"
          errs.push(`${s.sheetName}: BOM import — ${msg}`)
          setProgress((prev) => prev.map((p) => (p.sheetIndex === i ? { ...p, phase: "error", message: msg } : p)))
        }
      }
      // Attach mode: every sheet folded into a single parent Draft. Now
      // that all chunks across all sheets are done, activate that one
      // Draft (the last successful gather has the right bomVersionId).
      if (attachMode && gathered.length > 0) {
        const last = gathered[gathered.length - 1]
        if (last?.bomVersionId) {
          try {
            await fetch(`/api/items/${parentId}/bom/${last.bomVersionId}/activate`, { method: "POST" })
          } catch { /* non-fatal — user can activate manually */ }
        }
      }
      setResults(gathered)
      setImportErrors(errs)
      // Full success clears the sessionStorage draft — no reason to keep
      // WIP state around when everything committed. Partial failure keeps
      // the draft so the user can retry the failed sheets after a reload.
      if (errs.length === 0 && gathered.length === includedSheets.length) {
        clearDraft()
        // Attach mode with returnTo=edit: the caller (add-item form) wants
        // the user back on the item's edit page with a "BOM imported" hint.
        // Their entered fields are already persisted server-side, so the
        // edit form will render them from the item's own record.
        if (attachMode && returnTo === "edit" && parentId) {
          window.setTimeout(() => {
            router.push(`/items/edit/${encodeURIComponent(parentId)}?bomImported=1`)
          }, 900)
        }
      }
    } finally {
      setImporting(false)
    }
  }

  // ── render ─────────────────────────────────────────────────────────────
  const activeSheet: SheetState | undefined = sheets[active]

  const allDone = results.length > 0 && results.length === includedSheets.length && importErrors.length === 0

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-1.5">
        <div className="text-xs text-muted-foreground font-medium">
          <Link href="/items/list" className="hover:text-foreground">Items</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground font-semibold">Import BOM</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          {stageMode
            ? "Preview BOM before saving item"
            : attachMode
              ? "Attach BOM to Item"
              : "BOM Import Review"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {stageMode
            ? "Pick the sheets whose lines should form this item's BOM. Nothing is written to the database yet — the rows attach to the add-item form and commit only when you save the item there."
            : attachMode
              ? "Pick one or more sheets whose lines should form this item's BOM — they'll be merged into a single Draft. Every column is editable before you commit."
              : "One sheet = one assembled item. Every column is editable — fix names, part numbers, categories or quantities before you commit."}
        </p>
      </div>

      {/* Stage-mode banner */}
      {stageMode && (
        <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <Info className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
          <div className="flex-1 min-w-0 text-sm">
            <div className="font-bold text-foreground">Staged for the add-item form</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Your form entries (name, code, category, MFR&hellip;) are preserved. After you click <span className="font-semibold">Attach to add-item form</span>, you&apos;ll return to /items/add with the rows previewed inline. The item + BOM commit together when you press <span className="font-semibold">Save item</span>.
            </div>
          </div>
        </div>
      )}

      {/* Attach-mode target banner */}
      {attachMode && (
        <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <Package className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
          <div className="flex-1 min-w-0 text-sm">
            <div className="font-bold text-foreground">
              Target item{" "}
              {parentInfo ? (
                <span className="font-mono">{parentInfo.code}</span>
              ) : (
                <span className="text-muted-foreground">loading…</span>
              )}
              {parentInfo && (
                <span className="text-muted-foreground font-normal">
                  {" "}— {parentInfo.name}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              The item is already saved. Upload a workbook, tick every sheet whose lines belong on this item&apos;s BOM (they&apos;re merged into one Draft), then import — you&apos;ll go back to the edit page when it&apos;s done.
            </div>
          </div>
        </div>
      )}

      {/* Back link */}
      <div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>

      {/* Restore prompt — appears when sessionStorage has a saved WIP import
          from a prior page load. Never rehydrates silently. */}
      {pendingDraft && (
        <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <Info className="h-5 w-5 mt-0.5 shrink-0 text-primary" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-foreground">Restore your in-progress import?</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Found a draft from <span className="font-mono">{pendingDraft.fileName || "an unnamed workbook"}</span>{" "}
              — {pendingDraft.sheets.length} sheet{pendingDraft.sheets.length === 1 ? "" : "s"}, saved {relativeAge(pendingDraft.savedAt)}.
              Restore to pick up where you left off, or discard to start fresh.
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={discardDraft}>Discard</Button>
            <Button size="sm" onClick={restoreDraft}>Restore</Button>
          </div>
        </div>
      )}

      {/* Upload */}
      <Card className="border border-border">
        <CardContent className="p-6">
          <div
            onDragOver={(e) => { e.preventDefault(); if (!importing) setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${
              dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/10 hover:bg-muted/20"
            } ${importing ? "opacity-50 pointer-events-none" : ""}`}
            onClick={() => document.getElementById("bom-import-input")?.click()}
          >
            <input
              id="bom-import-input"
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = "" }}
            />
            {fileName ? (
              <div className="flex items-center justify-center gap-2 text-sm">
                <Upload className="h-4 w-4 text-primary" />
                <span className="font-semibold text-foreground">{fileName}</span>
                <span className="text-muted-foreground">— click to replace</span>
              </div>
            ) : (
              <div className="space-y-1">
                <Upload className="h-8 w-8 text-muted-foreground/60 mx-auto" />
                <div className="text-sm font-semibold text-foreground">Drop your spreadsheet here</div>
                <div className="text-xs text-muted-foreground">or click to browse — .xlsx / .xls / .csv</div>
              </div>
            )}
          </div>
          {parseError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Couldn&apos;t parse the file</div>
                <div className="text-xs opacity-90">{parseError}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {sheets.length > 0 && (
        <>
          {/* Global summary */}
          <div className="flex flex-wrap gap-2 text-sm">
            <SummaryChip label={`${includedSheets.length} of ${sheets.length} sheets`} />
            <SummaryChip label={`${globalCounts.totalRows} lines`} />
            <SummaryChip label={`${globalCounts.newItems} new items (deduped)`} />
            <SummaryChip label={`${globalCounts.linked} linked items (deduped)`} />
            <SummaryChip
              tone={globalCounts.issues > 0 ? "error" : "ok"}
              label={globalCounts.issues ? `${globalCounts.issues} need a name or part no.` : "No issues"}
            />
          </div>

          {/* Sheet tabs */}
          <div className="flex flex-wrap gap-1.5 border-b border-border">
            {sheets.map((s, i) => {
              const isExcluded = excluded.has(i)
              const issueCount = globalCounts.perSheetIssues[i]
              const isActive = i === active
              return (
                <div
                  key={s.sheetName + i}
                  className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary border-b-2 border-primary"
                      : isExcluded
                        ? "text-muted-foreground/50 line-through"
                        : "text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!isExcluded}
                    onChange={() => toggleExcluded(i)}
                    className="h-3.5 w-3.5 rounded border-border text-primary cursor-pointer"
                    title={isExcluded ? "Include this sheet" : "Skip this sheet on import"}
                    disabled={importing}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    className="flex items-center gap-1.5 cursor-pointer"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    {s.sheetName}
                    {s.isRollup && (
                      <span className="ml-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 text-[10px] font-bold">
                        roll-up
                      </span>
                    )}
                    {(!attachMode && !stageMode && !isExcluded && existingItems.byNameFull.has(s.parentName.trim().toLowerCase())) && (
                      <span className="ml-1 rounded-full bg-primary/15 text-primary px-1.5 text-[10px] font-bold" title="Parent name matches an existing item — will create a new BOM version">
                        vN+1
                      </span>
                    )}
                    {issueCount > 0 && !isExcluded && (
                      <span className="ml-1 rounded-full bg-destructive px-1.5 text-[10px] font-bold text-white">
                        {issueCount}
                      </span>
                    )}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Active sheet: parent details + grid */}
          {activeSheet && (
            <>
              {/* In attach mode the parent identity is fixed by the URL and
                  in stage mode it comes from the add-item form — either way
                  the parent-details card just adds noise, so hide it. */}
              {!attachMode && !stageMode && (
              <Card className="border border-border">
                <CardHeader className="border-b border-border bg-muted/20 px-6 py-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    Parent item — {activeSheet.sheetName}
                    {/* Version-on-existing indicator — the parent name matches
                        an existing item, so the importer will create a new
                        BOM version on it instead of a new item. */}
                    {(() => {
                      const hit = existingItems.byNameFull.get(activeSheet.parentName.trim().toLowerCase())
                      if (!hit) return null
                      return (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold">
                          → new BOM version on {hit.code}
                        </span>
                      )
                    })()}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Name<span className="text-destructive">*</span>
                    </label>
                    <Input
                      value={activeSheet.parentName}
                      onChange={(e) => patchSheet(active, {
                        parentName: e.target.value,
                        // Re-suggest code as the user types the name, unless
                        // they've hand-edited the code away from any suggestion.
                        parentCode: activeSheet.parentCode === suggestParentCode(activeSheet.parentName, activeSheet.parentStage)
                          ? suggestParentCode(e.target.value, activeSheet.parentStage)
                          : activeSheet.parentCode,
                      })}
                      className="h-9 text-sm"
                      disabled={importing}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Code<span className="text-destructive">*</span>
                    </label>
                    <Input
                      value={activeSheet.parentCode}
                      onChange={(e) => patchSheet(active, { parentCode: e.target.value })}
                      className="h-9 text-sm font-mono"
                      disabled={importing}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Stage</label>
                    <div className="flex items-center gap-1.5">
                      {(["assembled", "semi_assembled"] as Stage[]).map((s) => {
                        const active2 = activeSheet.parentStage === s
                        return (
                          <button
                            key={s}
                            type="button"
                            disabled={importing}
                            onClick={() => patchSheet(active, {
                              parentStage: s,
                              parentCode: suggestParentCode(activeSheet.parentName, s),
                            })}
                            className={`flex-1 text-xs font-bold rounded-lg border px-2 py-1.5 transition-colors ${
                              active2
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:bg-muted/30"
                            } ${importing ? "opacity-50" : ""}`}
                          >
                            {STAGE_META[s].label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="space-y-1.5 md:col-span-2 lg:col-span-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Category <span className="normal-case text-[10px] font-medium">(within {STAGE_META[activeSheet.parentStage].label})</span>
                      </label>
                      {/* Apply-to-rest: copies this sheet's category to every
                          OTHER sheet that shares its stage (a raw-only category
                          would be invalid on a differently-staged sheet, and
                          the picker filter enforces that at the row level). */}
                      {activeSheet.parentCategoryId && sheets.length > 1 && (() => {
                        const targets = sheets
                          .map((s, i) => ({ s, i }))
                          .filter(({ s, i }) =>
                            i !== active &&
                            s.parentStage === activeSheet.parentStage &&
                            s.parentCategoryId !== activeSheet.parentCategoryId,
                          )
                        if (targets.length === 0) return null
                        return (
                          <button
                            type="button"
                            disabled={importing}
                            onClick={() => {
                              const catId = activeSheet.parentCategoryId
                              setSheets((prev) => prev.map((s, i) =>
                                (i !== active && s.parentStage === activeSheet.parentStage)
                                  ? { ...s, parentCategoryId: catId }
                                  : s,
                              ))
                            }}
                            className="text-[11px] font-semibold text-primary hover:underline cursor-pointer disabled:opacity-40 disabled:no-underline"
                            title={`Copy this category to ${targets.length} other ${STAGE_META[activeSheet.parentStage].label.toLowerCase()} sheet${targets.length === 1 ? "" : "s"}`}
                          >
                            Apply to {targets.length} other sheet{targets.length === 1 ? "" : "s"}
                          </button>
                        )
                      })()}
                    </div>
                    <CategoryCascade
                      value={activeSheet.parentCategoryId}
                      onChange={(id) => patchSheet(active, { parentCategoryId: id })}
                      allLabel="— Select a category —"
                      stageFilter={activeSheet.parentStage}
                    />
                  </div>
                </CardContent>
              </Card>
              )}

              {/* Editable grid */}
              <Card className="border border-border overflow-hidden">
                <CardHeader className="border-b border-border bg-muted/20 px-6 py-3 flex-row items-center justify-between">
                  <CardTitle className="text-sm font-bold">
                    {activeSheet.sheetName} · {activeSheet.rows.length} line{activeSheet.rows.length === 1 ? "" : "s"}
                  </CardTitle>
                  {excluded.has(active) && (
                    <span className="text-[11px] font-semibold text-muted-foreground/60">
                      Excluded from import — tick the tab to include.
                    </span>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  <DragScrollArea className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px] border-b border-border">
                        <tr>
                          {["Category", "Name", "Part No.", "Manufacturer", "Supplier", "Solder", "Footprint", "Qty", "Ref", "Status", ""].map((h) => (
                            <th key={h} className="px-2 py-2 text-left font-bold whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {activeSheet.rows.map((r, i) => {
                          const bad = isRowInvalid(r)
                          const status = bad ? null : statusFor(r)
                          return (
                            <tr key={i} className={bad ? "bg-destructive/5" : "hover:bg-muted/10"}>
                              <td className="px-2 py-1 min-w-[200px]">
                                <CategoryCascade
                                  value={r.categoryId}
                                  onChange={(id) => patchRow(active, i, { categoryId: id })}
                                  allLabel="— Uncategorised —"
                                  stageFilter="raw"
                                />
                              </td>
                              <td className="px-2 py-1 min-w-[160px]">
                                <Input
                                  value={r.name}
                                  onChange={(e) => patchRow(active, i, { name: e.target.value })}
                                  className={`h-7 text-xs ${bad ? "border-destructive ring-1 ring-destructive" : ""}`}
                                  placeholder={bad ? "name or part no. required" : ""}
                                  disabled={importing}
                                />
                              </td>
                              <td className="px-2 py-1 min-w-[120px]">
                                <Input
                                  value={r.partNo}
                                  onChange={(e) => patchRow(active, i, { partNo: e.target.value })}
                                  className={`h-7 text-xs font-mono ${bad ? "border-destructive ring-1 ring-destructive" : ""}`}
                                  disabled={importing}
                                />
                              </td>
                              <td className="px-2 py-1 min-w-[130px]">
                                <Input
                                  value={r.manufacturer}
                                  onChange={(e) => patchRow(active, i, { manufacturer: e.target.value })}
                                  className="h-7 text-xs"
                                  disabled={importing}
                                />
                              </td>
                              <td className="px-2 py-1 min-w-[130px]">
                                <Input
                                  value={r.supplier}
                                  onChange={(e) => patchRow(active, i, { supplier: e.target.value })}
                                  className="h-7 text-xs"
                                  disabled={importing}
                                />
                              </td>
                              <td className="px-2 py-1">
                                <select
                                  value={r.solderType}
                                  onChange={(e) => patchRow(active, i, { solderType: e.target.value })}
                                  className="h-7 rounded-md border border-border bg-background px-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                                  disabled={importing}
                                >
                                  <option value="">—</option>
                                  <option value="SMD">SMD</option>
                                  <option value="DIP">DIP</option>
                                </select>
                              </td>
                              <td className="px-2 py-1 min-w-[100px]">
                                <Input
                                  value={r.footprint}
                                  onChange={(e) => patchRow(active, i, { footprint: e.target.value })}
                                  className="h-7 text-xs font-mono"
                                  disabled={importing}
                                />
                              </td>
                              <td className="px-2 py-1">
                                <Input
                                  type="number"
                                  step="any"
                                  min={0}
                                  value={r.qty}
                                  onChange={(e) => patchRow(active, i, { qty: Number(e.target.value) })}
                                  className="h-7 w-16 text-xs font-mono"
                                  disabled={importing}
                                />
                              </td>
                              <td className="px-2 py-1 min-w-[140px]">
                                <Input
                                  value={r.ref}
                                  onChange={(e) => patchRow(active, i, { ref: e.target.value })}
                                  className="h-7 text-xs font-mono"
                                  disabled={importing}
                                />
                              </td>
                              <td className="px-2 py-1">
                                {status && (
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    status === "Linked"
                                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                      : "bg-primary/10 text-primary"
                                  }`}>
                                    {status}
                                  </span>
                                )}
                              </td>
                              <td className="px-1 py-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeRow(active, i)}
                                  disabled={importing}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                                  aria-label="Remove row"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                        {activeSheet.rows.length === 0 && (
                          <tr>
                            <td colSpan={11} className="px-3 py-6 text-center text-muted-foreground italic">
                              This sheet has no rows.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </DragScrollArea>
                </CardContent>
              </Card>
            </>
          )}

          {/* Progress panel while importing */}
          {(importing || progress.length > 0) && (
            <Card className="border border-border">
              <CardHeader className="border-b border-border bg-muted/20 px-6 py-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  {importing ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                  Import progress
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-1.5">
                {progress.map((p) => {
                  const s = sheets[p.sheetIndex]
                  return (
                    <div key={p.sheetIndex} className="flex items-center gap-2 text-xs">
                      {p.phase === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                      {p.phase === "error" && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                      {p.phase !== "done" && p.phase !== "error" && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />}
                      <span className="font-semibold min-w-[10rem]">{s?.sheetName ?? `Sheet ${p.sheetIndex}`}</span>
                      <span className="text-muted-foreground">
                        {p.phase === "creating-item" && "creating parent item…"}
                        {p.phase === "importing-bom" && (
                          p.rowsTotal != null
                            ? `importing BOM lines… ${p.rowsDone ?? 0} / ${p.rowsTotal}`
                            : "importing BOM lines…"
                        )}
                        {p.phase === "done" && "done"}
                        {p.phase === "error" && (p.message ?? "failed")}
                      </span>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {/* Result summary */}
          {results.length > 0 && (
            <Card className="border border-border">
              <CardHeader className="border-b border-border bg-emerald-500/5 px-6 py-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> {results.length} assembl{results.length === 1 ? "y" : "ies"} imported
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                {results.map((r, idx) => (
                  // In attach mode every sheet resolves to the SAME parentItemId,
                  // so keying on it alone collides. Combining with the row index
                  // keeps keys unique per rendered result line.
                  <div key={`${r.parentItemId}-${idx}`} className="flex flex-wrap items-center gap-2 text-xs">
                    <Link
                      href={`/items/${encodeURIComponent(r.parentItemId)}/bom`}
                      className="font-mono font-bold text-primary hover:underline"
                    >
                      {r.parentCode}
                    </Link>
                    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      r.parentReused
                        ? "bg-primary/10 text-primary"
                        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    }`}>
                      {r.parentReused ? "new BOM version" : "new item"}
                    </span>
                    <span className="text-muted-foreground">
                      {r.linesCreated} lines · {r.itemsCreated} new items · {r.itemsMatched} matched · {r.brandsCreated} brands · {r.suppliersCreated} suppliers
                      {r.skipped > 0 ? ` · ${r.skipped} skipped` : ""}
                    </span>
                  </div>
                ))}
                {importErrors.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border space-y-1">
                    <div className="text-xs font-bold text-destructive">Errors:</div>
                    {importErrors.map((e, i) => (
                      <div key={i} className="text-xs text-destructive flex items-start gap-1.5">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {e}
                      </div>
                    ))}
                  </div>
                )}
                {allDone && (
                  <div className="mt-3 flex items-center gap-2">
                    {attachMode && parentId ? (
                      <Button size="sm" onClick={() => router.push(`/items/edit/${encodeURIComponent(parentId)}?bomImported=1`)}>
                        Back to item edit
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => router.push("/items/list")}>Go to Items list</Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-end gap-3">
            {globalCounts.issues > 0 ? (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
                <AlertTriangle className="h-4 w-4" /> Fix {globalCounts.issues} row{globalCounts.issues > 1 ? "s" : ""} to import
              </span>
            ) : (!attachMode && includedSheets.some(({ s }) => !s.parentName.trim() || !s.parentCode.trim())) ? (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-600 dark:text-amber-400">
                <Info className="h-4 w-4" /> Every included sheet needs a parent name and code
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                {stageMode ? "Ready to attach" : "Ready to import"}
              </span>
            )}
            <Button
              disabled={!canImport}
              className="font-bold gap-1.5"
              onClick={stageMode ? doStage : doImport}
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importing
                ? "Importing…"
                : stageMode
                  ? `Attach ${includedSheets.reduce((n, { s }) => n + s.rows.filter((r) => !isRowInvalid(r)).length, 0)} lines to add-item form`
                  : attachMode
                    ? `Attach ${includedSheets.length === 1 ? "sheet's BOM" : `${includedSheets.length} sheets' BOMs`}`
                    : `Import ${includedSheets.length} assembl${includedSheets.length === 1 ? "y" : "ies"}`}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ── helpers ────────────────────────────────────────────────────────────────
function buildSheetState(p: ImportedPcb, initialStage: Stage, byLowerCategoryName: Map<string, string>): SheetState {
  const rows: Row[] = p.lines.map((l) => ({
    categoryId: guessCategory(l.type, byLowerCategoryName),
    name: clean(l.name),
    partNo: clean(l.partNumber) || clean(l.genericPartNumber ?? ""),
    manufacturer: clean(l.manufacturer),
    supplier: clean(l.supplier),
    solderType: (() => {
      const s = clean(l.solderType).toUpperCase()
      return s === "SMD" || s === "DIP" ? s : ""
    })(),
    footprint: clean(l.footprint),
    qty: Number.isFinite(l.qty) && l.qty > 0 ? l.qty : 1,
    ref: clean(l.reference),
  }))
  return {
    sheetName: p.sheetName,
    isRollup: p.isRollup,
    parentName: p.name || p.sheetName,
    parentCode: suggestParentCode(p.name || p.sheetName, initialStage),
    parentStage: initialStage,
    parentCategoryId: "",
    rows,
  }
}

function SummaryChip({ label, tone = "default" }: { label: string; tone?: "default" | "ok" | "error" }) {
  const cls =
    tone === "error"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : tone === "ok"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : "border-border bg-background text-foreground"
  return <span className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${cls}`}>{label}</span>
}
