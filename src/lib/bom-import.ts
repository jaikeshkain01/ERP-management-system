// Maps a parsed spreadsheet (see import-spreadsheet.ts) onto BOM line items.
//
// The column headers in a supplier/customer BOM vary wildly ("Qty" vs
// "Quantity" vs "Qty Needed", "Part Number" vs "MPN", …). This module owns the
// fuzzy header→field matching so the UI just receives clean ImportedBomLine[].

import { parseSpreadsheetFile, type ParsedSheet } from "@/lib/import-spreadsheet"

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
