// Dependency-free "Export to Excel" helper.
// Produces a genuine Excel workbook using the SpreadsheetML 2003 (.xls) XML
// format — real typed columns, a styled header row, and a totals row — so the
// file opens directly in Excel / Google Sheets / LibreOffice without any
// third-party library.

export interface ExcelColumn<T> {
  header: string
  /** Cell value for a given row (index is 0-based). Return a number for numeric columns. */
  value: (row: T, index: number) => string | number | null | undefined
  /** Force a type; inferred from the value when omitted. */
  type?: "String" | "Number"
  /** Optional fixed column width (in characters). */
  width?: number
}

interface ExportOptions<T> {
  fileName: string
  sheetName: string
  columns: ExcelColumn<T>[]
  rows: T[]
  /** Optional bold totals row: one value (string | number) per column, or null to leave blank. */
  totalsRow?: (string | number | null)[]
}

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")

function buildCell(
  raw: string | number | null | undefined,
  forcedType: "String" | "Number" | undefined,
  styleId?: string,
): string {
  const isNumber =
    forcedType === "Number" || (forcedType === undefined && typeof raw === "number")
  const safe = raw === null || raw === undefined ? "" : raw
  const type = isNumber ? "Number" : "String"
  const data = isNumber ? String(safe) : escapeXml(String(safe))
  const styleAttr = styleId ? ` ss:StyleID="${styleId}"` : ""
  return `<Cell${styleAttr}><Data ss:Type="${type}">${data}</Data></Cell>`
}

export function exportToExcel<T>(options: ExportOptions<T>): void {
  const { fileName, sheetName, columns, rows, totalsRow } = options

  const columnsXml = columns
    .map((c) => `<Column${c.width ? ` ss:Width="${c.width * 6}"` : ""}/>`)
    .join("")

  const headerXml =
    "<Row ss:StyleID=\"hdr\">" +
    columns.map((c) => buildCell(c.header, "String", "hdr")).join("") +
    "</Row>"

  const bodyXml = rows
    .map(
      (row, index) =>
        "<Row>" +
        columns.map((c) => buildCell(c.value(row, index), c.type)).join("") +
        "</Row>",
    )
    .join("")

  const totalsXml =
    totalsRow && totalsRow.length
      ? "<Row ss:StyleID=\"total\">" +
        columns
          .map((c, i) => buildCell(totalsRow[i] ?? "", c.type, "total"))
          .join("") +
        "</Row>"
      : ""

  const xml =
    '<?xml version="1.0"?>\n' +
    '<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"' +
    ' xmlns:o="urn:schemas-microsoft-com:office:office"' +
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"' +
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    "<Styles>" +
    '<Style ss:ID="hdr"><Font ss:Bold="1" ss:Color="#1E293B"/>' +
    '<Interior ss:Color="#EBF0F5" ss:Pattern="Solid"/>' +
    '<Alignment ss:Vertical="Center"/></Style>' +
    '<Style ss:ID="total"><Font ss:Bold="1"/>' +
    '<Interior ss:Color="#F5F7FA" ss:Pattern="Solid"/></Style>' +
    "</Styles>" +
    `<Worksheet ss:Name="${escapeXml(sheetName)}"><Table>` +
    columnsXml +
    headerXml +
    bodyXml +
    totalsXml +
    "</Table></Worksheet></Workbook>"

  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName.endsWith(".xls") ? fileName : `${fileName}.xls`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
