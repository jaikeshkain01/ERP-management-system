// Dependency-free spreadsheet reader — the import counterpart to export-excel.ts.
//
// Reads a user-selected file entirely in the browser and returns a simple grid
// (header row + data rows). Three formats are understood, auto-detected from the
// bytes so the caller never has to care:
//
//   • .xlsx  — real Office Open XML (a ZIP of XML parts). Unzipped with the
//              platform DecompressionStream ("deflate-raw"); shared strings and
//              the first worksheet are parsed with DOMParser.
//   • .xls   — the SpreadsheetML 2003 XML dialect this app's exporter emits, so
//              a previously-exported sheet round-trips back in.
//   • .csv   — comma-separated, with standard quoted-field handling.
//
// No third-party library, matching the house style of export-excel.ts.

export interface ParsedSheet {
  /** First non-empty row, trimmed — used as column keys. */
  headers: string[]
  /** Data rows after the header, each aligned (padded) to headers.length. */
  rows: string[][]
  /** Header→value records for each data row. */
  records: Record<string, string>[]
  sheetName: string
}

// ---------------------------------------------------------------------------
//  ZIP (only what .xlsx needs: central-directory walk + raw inflate)
// ---------------------------------------------------------------------------

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw")
  const writer = ds.writable.getWriter()
  void writer.write(data as unknown as BufferSource)
  void writer.close()
  const ab = await new Response(ds.readable).arrayBuffer()
  return new Uint8Array(ab)
}

interface ZipEntry {
  method: number
  compSize: number
  localOffset: number
}

function readZipIndex(buf: ArrayBuffer): Map<string, ZipEntry> {
  const dv = new DataView(buf)
  const bytes = new Uint8Array(buf)
  const decoder = new TextDecoder()

  // Locate the End Of Central Directory record by scanning backwards.
  let eocd = -1
  for (let i = buf.byteLength - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error("Not a valid .xlsx file (missing ZIP directory).")

  const cdCount = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  const index = new Map<string, ZipEntry>()

  for (let n = 0; n < cdCount; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break
    const method = dv.getUint16(p + 10, true)
    const compSize = dv.getUint32(p + 20, true)
    const nameLen = dv.getUint16(p + 28, true)
    const extraLen = dv.getUint16(p + 30, true)
    const commentLen = dv.getUint16(p + 32, true)
    const localOffset = dv.getUint32(p + 42, true)
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    index.set(name, { method, compSize, localOffset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return index
}

async function readZipEntry(
  buf: ArrayBuffer,
  entry: ZipEntry | undefined,
): Promise<string | null> {
  if (!entry) return null
  const dv = new DataView(buf)
  const bytes = new Uint8Array(buf)
  const lo = entry.localOffset
  if (dv.getUint32(lo, true) !== 0x04034b50) return null
  const nameLen = dv.getUint16(lo + 26, true)
  const extraLen = dv.getUint16(lo + 28, true)
  const start = lo + 30 + nameLen + extraLen
  const compressed = bytes.subarray(start, start + entry.compSize)
  const raw =
    entry.method === 0
      ? compressed
      : entry.method === 8
        ? await inflateRaw(compressed)
        : null
  if (!raw) return null
  return new TextDecoder().decode(raw)
}

// ---------------------------------------------------------------------------
//  .xlsx worksheet + shared-string parsing
// ---------------------------------------------------------------------------

function columnIndex(cellRef: string): number {
  const letters = cellRef.match(/^[A-Z]+/)?.[0] ?? "A"
  let n = 0
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64)
  return n - 1
}

function textOfNode(node: Element | null): string {
  if (!node) return ""
  // Concatenate every <t> run (handles rich-text <si><r><t>…).
  const ts = node.getElementsByTagName("t")
  if (ts.length === 0) return node.textContent ?? ""
  let s = ""
  for (let i = 0; i < ts.length; i++) s += ts[i].textContent ?? ""
  return s
}

function parseSharedStrings(xml: string | null): string[] {
  if (!xml) return []
  const doc = new DOMParser().parseFromString(xml, "application/xml")
  const sis = doc.getElementsByTagName("si")
  const out: string[] = []
  for (let i = 0; i < sis.length; i++) out.push(textOfNode(sis[i]))
  return out
}

function parseWorksheet(xml: string, shared: string[]): string[][] {
  const doc = new DOMParser().parseFromString(xml, "application/xml")
  const rowEls = doc.getElementsByTagName("row")
  const grid: string[][] = []

  for (let r = 0; r < rowEls.length; r++) {
    const cellEls = rowEls[r].getElementsByTagName("c")
    const row: string[] = []
    for (let c = 0; c < cellEls.length; c++) {
      const cell = cellEls[c]
      const ref = cell.getAttribute("r") ?? ""
      const col = ref ? columnIndex(ref) : row.length
      const type = cell.getAttribute("t")
      let value = ""
      if (type === "s") {
        const v = cell.getElementsByTagName("v")[0]
        value = v ? shared[Number(v.textContent) || 0] ?? "" : ""
      } else if (type === "inlineStr" || type === "str") {
        value = textOfNode(cell)
      } else {
        value = cell.getElementsByTagName("v")[0]?.textContent ?? ""
      }
      row[col] = value
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = ""
    grid.push(row)
  }
  return grid
}

async function parseXlsx(buf: ArrayBuffer): Promise<{ grid: string[][]; sheetName: string }> {
  const index = readZipIndex(buf)

  // Resolve the first worksheet part; fall back to the conventional path.
  let sheetPath = "xl/worksheets/sheet1.xml"
  if (!index.has(sheetPath)) {
    const first = [...index.keys()]
      .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort()[0]
    if (first) sheetPath = first
  }

  const [sheetXml, sharedXml] = await Promise.all([
    readZipEntry(buf, index.get(sheetPath)),
    readZipEntry(buf, index.get("xl/sharedStrings.xml")),
  ])
  if (!sheetXml) throw new Error("Could not read the worksheet from this .xlsx file.")

  // Best-effort sheet name from workbook.xml.
  let sheetName = "Sheet1"
  const workbookXml = await readZipEntry(buf, index.get("xl/workbook.xml"))
  if (workbookXml) {
    const doc = new DOMParser().parseFromString(workbookXml, "application/xml")
    sheetName = doc.getElementsByTagName("sheet")[0]?.getAttribute("name") ?? sheetName
  }

  return { grid: parseWorksheet(sheetXml, parseSharedStrings(sharedXml)), sheetName }
}

// ---------------------------------------------------------------------------
//  SpreadsheetML 2003 (.xls) — the format export-excel.ts writes
// ---------------------------------------------------------------------------

function parseSpreadsheetML(xml: string): { grid: string[][]; sheetName: string } {
  const doc = new DOMParser().parseFromString(xml, "application/xml")
  const worksheet = doc.getElementsByTagName("Worksheet")[0]
  const sheetName =
    worksheet?.getAttribute("ss:Name") ?? worksheet?.getAttribute("Name") ?? "Sheet1"
  const rowEls = doc.getElementsByTagName("Row")
  const grid: string[][] = []

  for (let r = 0; r < rowEls.length; r++) {
    const cellEls = rowEls[r].getElementsByTagName("Cell")
    const row: string[] = []
    let col = 0
    for (let c = 0; c < cellEls.length; c++) {
      const cell = cellEls[c]
      const idxAttr = cell.getAttribute("ss:Index") ?? cell.getAttribute("Index")
      if (idxAttr) col = Number(idxAttr) - 1 // ss:Index is 1-based
      const data = cell.getElementsByTagName("Data")[0]
      row[col] = data?.textContent ?? ""
      col++
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = ""
    grid.push(row)
  }
  return { grid, sheetName }
}

// ---------------------------------------------------------------------------
//  CSV
// ---------------------------------------------------------------------------

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else {
      field += ch
    }
  }
  if (field !== "" || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// ---------------------------------------------------------------------------
//  Public entry point
// ---------------------------------------------------------------------------

/** Turn a raw grid into a headers + records ParsedSheet, skipping leading blank rows. */
function gridToSheet(grid: string[][], sheetName: string): ParsedSheet {
  const nonEmpty = grid.filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
  if (nonEmpty.length === 0) return { headers: [], rows: [], records: [], sheetName }

  const headers = nonEmpty[0].map((h) => String(h ?? "").trim())
  const width = headers.length
  const rows = nonEmpty.slice(1).map((r) => {
    const padded = r.slice(0, width)
    while (padded.length < width) padded.push("")
    return padded.map((c) => String(c ?? "").trim())
  })
  const records = rows.map((r) => {
    const rec: Record<string, string> = {}
    headers.forEach((h, i) => {
      if (h) rec[h] = r[i] ?? ""
    })
    return rec
  })
  return { headers, rows, records, sheetName }
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedSheet> {
  const buf = await file.arrayBuffer()
  const head = new Uint8Array(buf.slice(0, 8))

  // ZIP local-file signature "PK\x03\x04" → .xlsx
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
    const { grid, sheetName } = await parseXlsx(buf)
    return gridToSheet(grid, sheetName)
  }

  const text = new TextDecoder().decode(buf).replace(/^﻿/, "")
  const trimmed = text.trimStart()

  // SpreadsheetML 2003 XML (what this app exports as .xls)
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<Workbook") || trimmed.includes("urn:schemas-microsoft-com:office:spreadsheet")) {
    const { grid, sheetName } = parseSpreadsheetML(text)
    return gridToSheet(grid, sheetName)
  }

  // Fallback: treat as CSV
  return gridToSheet(parseCsv(text), file.name.replace(/\.[^.]+$/, ""))
}
