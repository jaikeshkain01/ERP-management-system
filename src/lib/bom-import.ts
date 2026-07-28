// Maps a parsed spreadsheet (see import-spreadsheet.ts) onto BOM line items.
//
// The column headers in a supplier/customer BOM vary wildly ("Qty" vs
// "Quantity" vs "Qty Needed", "Part Number" vs "MPN", …). This module owns the
// fuzzy header→field matching so the UI just receives clean ImportedBomLine[].

import { parseAllSheets, parseSpreadsheetFile, type ParsedSheet } from "@/lib/import-spreadsheet"

export interface ImportedBomLine {
  type: string
  name: string
  partNumber: string
  solderType: string
  footprint: string
  qty: number
  manufacturer: string
  supplier: string
  reference: string
}

export type BomField = keyof Omit<ImportedBomLine, "qty"> | "qty"

export interface BomImportResult {
  lines: ImportedBomLine[]
  /** Which source header was matched to each BOM field (for the mapping preview). */
  mapping: Partial<Record<BomField, string>>
  headers: string[]
  sheetName: string
  /** Rows present in the sheet body before empty/junk rows were dropped. */
  totalRows: number
  skippedRows: number
}

// Ordered alias lists. Exact (normalized) matches win over substring matches,
// and the first field to claim a header keeps it.
const FIELD_ALIASES: Record<BomField, string[]> = {
  type: ["type", "category", "component type", "part type"],
  name: ["name", "description", "component", "value", "part name", "designation"],
  partNumber: [
    "part number",
    "part no",
    "partno",
    "part #",
    "mpn",
    "manufacturer part number",
    "manufacturer part no",
  ],
  solderType: ["solder type", "solder", "mount", "mounting", "technology", "smt/tht"],
  footprint: ["footprint", "package", "pkg", "case"],
  qty: ["quantity", "qty", "qty per unit", "qty/unit", "qtyunit", "qty needed"],
  manufacturer: ["manufacturer", "mfr", "mfg", "make", "brand"],
  supplier: ["supplier", "vendor", "distributor"],
  reference: ["reference", "ref", "refdes", "designator", "reference designator", "ref des"],
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

function buildMapping(headers: string[]): {
  byField: Partial<Record<BomField, number>>
  mapping: Partial<Record<BomField, string>>
} {
  const normHeaders = headers.map(normalize)
  const claimed = new Set<number>()
  const byField: Partial<Record<BomField, number>> = {}
  const mapping: Partial<Record<BomField, string>> = {}

  const assign = (field: BomField, col: number) => {
    byField[field] = col
    mapping[field] = headers[col]
    claimed.add(col)
  }

  // Pass 1 — exact normalized matches.
  for (const field of Object.keys(FIELD_ALIASES) as BomField[]) {
    const aliases = FIELD_ALIASES[field].map(normalize)
    for (let c = 0; c < normHeaders.length; c++) {
      if (claimed.has(c)) continue
      if (aliases.includes(normHeaders[c])) {
        assign(field, c)
        break
      }
    }
  }

  // Pass 2 — substring matches for anything still unmapped.
  for (const field of Object.keys(FIELD_ALIASES) as BomField[]) {
    if (byField[field] !== undefined) continue
    const aliases = FIELD_ALIASES[field].map(normalize)
    for (let c = 0; c < normHeaders.length; c++) {
      if (claimed.has(c) || !normHeaders[c]) continue
      if (aliases.some((a) => normHeaders[c].includes(a) || a.includes(normHeaders[c]))) {
        assign(field, c)
        break
      }
    }
  }

  return { byField, mapping }
}

function toNumber(raw: string): number {
  const n = Number(String(raw).replace(/[^0-9.\-]/g, ""))
  return Number.isFinite(n) ? n : 0
}

/** Map an already-parsed sheet to BOM lines. Exposed for testing/preview. */
export function mapSheetToBom(sheet: ParsedSheet): BomImportResult {
  const { byField, mapping } = buildMapping(sheet.headers)
  const col = (f: BomField) => byField[f]

  const lines: ImportedBomLine[] = []
  let skipped = 0

  for (const row of sheet.rows) {
    const at = (f: BomField) => {
      const c = col(f)
      return c === undefined ? "" : (row[c] ?? "").trim()
    }
    const name = at("name")
    const partNumber = at("partNumber")
    // Junk / group-separator rows carry neither an identity nor a part number.
    if (!name && !partNumber) {
      skipped++
      continue
    }
    const qtyRaw = at("qty")
    lines.push({
      type: at("type"),
      name,
      partNumber,
      solderType: at("solderType"),
      footprint: at("footprint"),
      qty: qtyRaw ? Math.max(0, Math.round(toNumber(qtyRaw))) : 1,
      manufacturer: at("manufacturer"),
      supplier: at("supplier"),
      reference: at("reference"),
    })
  }

  return {
    lines,
    mapping,
    headers: sheet.headers,
    sheetName: sheet.sheetName,
    totalRows: sheet.rows.length,
    skippedRows: skipped,
  }
}

export async function parseBomFile(file: File): Promise<BomImportResult> {
  const sheet = await parseSpreadsheetFile(file)
  if (sheet.headers.length === 0) {
    throw new Error("The file appears to be empty.")
  }
  const result = mapSheetToBom(sheet)
  if (result.mapping.name === undefined && result.mapping.partNumber === undefined) {
    throw new Error(
      "Couldn't find a Name or Part Number column. Expected headers like Type, Name, Part Number, Solder Type, Footprint, Quantity.",
    )
  }
  if (result.lines.length === 0) {
    throw new Error("No component rows were found in the file.")
  }
  return result
}

// ---------------------------------------------------------------------------
//  Multi-sheet workbooks — one PCB per tab
// ---------------------------------------------------------------------------

/** One workbook tab mapped to a would-be PCB and its component lines. */
export interface ImportedPcb {
  /** The Excel tab name — used as the PCB name. */
  sheetName: string
  /** Editable/display PCB name (defaults to sheetName). */
  name: string
  lines: ImportedBomLine[]
  mapping: Partial<Record<BomField, string>>
  headers: string[]
  totalRows: number
  skippedRows: number
  /**
   * True when the tab parsed as a usable board BOM: it has a Name or Part
   * Number column AND at least one component row. Empty tabs (e.g. a "draft"
   * placeholder) come back false so the UI can pre-exclude them.
   */
  isBom: boolean
  /**
   * A usable BOM that nonetheless looks like a cross-board roll-up rather than
   * a single physical PCB — either its name says so ("Combined", "Summary", …)
   * or it lacks a per-part Designator/Reference column while sibling board tabs
   * have one. Still importable, but the UI leaves it unticked by default.
   */
  isRollup: boolean
}

/** Sheet names that signal a consolidated/summary tab rather than one board. */
const ROLLUP_NAME = /combined|consolidat|summary|overview|master|roll[\s_-]?up|\btotals?\b|\ball\b/i

export interface WorkbookBomResult {
  pcbs: ImportedPcb[]
}

/**
 * Parse a whole workbook into per-tab PCBs. Every tab is returned (so the UI
 * can list them and let the user toggle which become PCBs); `isBom` flags the
 * ones that actually look like a board BOM.
 */
export async function parseBomWorkbook(file: File): Promise<WorkbookBomResult> {
  const sheets = await parseAllSheets(file)
  if (sheets.length === 0) throw new Error("The file appears to be empty.")

  const pcbs: ImportedPcb[] = sheets.map((sheet) => {
    if (sheet.headers.length === 0) {
      return {
        sheetName: sheet.sheetName,
        name: sheet.sheetName,
        lines: [],
        mapping: {},
        headers: [],
        totalRows: 0,
        skippedRows: 0,
        isBom: false,
        isRollup: false,
      }
    }
    const mapped = mapSheetToBom(sheet)
    const isBom =
      (mapped.mapping.name !== undefined || mapped.mapping.partNumber !== undefined) &&
      mapped.lines.length > 0
    return {
      sheetName: sheet.sheetName,
      name: sheet.sheetName,
      lines: mapped.lines,
      mapping: mapped.mapping,
      headers: mapped.headers,
      totalRows: mapped.totalRows,
      skippedRows: mapped.skippedRows,
      isBom,
      isRollup: false, // resolved below, once every sheet is known
    }
  })

  // Roll-up detection needs the whole workbook: only treat a missing Designator
  // as a roll-up signal when other board tabs actually have one.
  const anyHasDesignator = pcbs.some((p) => p.isBom && p.mapping.reference !== undefined)
  for (const p of pcbs) {
    if (!p.isBom) continue
    const nameSaysRollup = ROLLUP_NAME.test(p.sheetName)
    const lacksDesignator = anyHasDesignator && p.mapping.reference === undefined
    p.isRollup = nameSaysRollup || lacksDesignator
  }

  if (!pcbs.some((p) => p.isBom)) {
    throw new Error(
      "No sheet looked like a BOM. Each PCB sheet needs a Name or Part Number column and at least one component row.",
    )
  }
  return { pcbs }
}

/** Human-readable field labels for the mapping preview. */
export const BOM_FIELD_LABELS: Record<BomField, string> = {
  type: "Type",
  name: "Name",
  partNumber: "Part Number",
  solderType: "Solder Type",
  footprint: "Footprint",
  qty: "Quantity",
  manufacturer: "Manufacturer",
  supplier: "Supplier",
  reference: "Reference",
}
