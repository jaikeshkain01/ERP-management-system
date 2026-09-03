/**
 * Standalone analyzer for a SSCE-style multi-sheet BOM workbook.
 * Uses the app's own parseAllSheets so the row shape matches what the
 * importer actually sees, then mimics the (brand, PN, name) dedup key
 * the server uses in bom-import.ts.
 */
import "dotenv/config"
import * as fs from "fs"
import * as path from "path"
import { DOMParser } from "@xmldom/xmldom"
// The client-side spreadsheet reader uses browser DOMParser to walk the
// worksheet XML. Node doesn't ship it, so polyfill before the import lib
// captures the (missing) global.
;(globalThis as unknown as { DOMParser: typeof DOMParser }).DOMParser = DOMParser
import { parseBomWorkbook } from "../src/lib/bom-import"

const FILE = "C:/Users/Jaikesh/Downloads/BOM PCB SSCE.xlsx"

async function main() {
  const bytes = fs.readFileSync(FILE)
  // Node 20+ has global File / Blob. Wrap the buffer so parseAllSheets can call .arrayBuffer().
  const file = new File([new Uint8Array(bytes)], path.basename(FILE), {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })

  const { pcbs } = await parseBomWorkbook(file)

  console.log("=".repeat(80))
  console.log(`Workbook: ${path.basename(FILE)}`)
  console.log(`Sheets: ${pcbs.length}`)
  console.log("=".repeat(80))

  // Server-side dedup key (see bom-import.ts: findItemByBrandAndPartNo comment):
  //   `${brand||no-manufacturer}|${upper(pn)}|${lower(name)}` when a PN is present
  //   `${lower(name)}|${footprint}|${solder}` when no PN
  const globalKeys = new Set<string>()

  console.log("\nPer-sheet counts (raw rows → unique after dedup):")
  console.log("-".repeat(80))

  let grandRaw = 0
  let grandUnique = 0
  for (const p of pcbs) {
    if (!p.isBom) {
      console.log(`  ${p.sheetName.padEnd(24)}  (not a BOM sheet)`)
      continue
    }
    if (p.isRollup) {
      console.log(`  ${p.sheetName.padEnd(24)}  ${String(p.lines.length).padStart(4)} rows  [ROLL-UP — excluded by default]`)
      continue
    }

    const seenInSheet = new Set<string>()
    for (const l of p.lines) {
      const name = String(l.name ?? "").trim()
      if (!name) continue
      const pn = String(l.partNumber ?? l.genericPartNumber ?? "").trim()
      const brand = String(l.manufacturer ?? "").trim().toLowerCase() || "no-manufacturer"
      const footprint = String(l.footprint ?? "").trim().toLowerCase()
      const solder = String(l.solderType ?? "").trim().toUpperCase()
      const key = pn
        ? `${brand}|${pn.toUpperCase()}|${name.toLowerCase()}`
        : `NP|${name.toLowerCase()}|${footprint}|${solder}`
      seenInSheet.add(key)
      globalKeys.add(key)
    }

    const raw = p.lines.length
    const unique = seenInSheet.size
    grandRaw += raw
    grandUnique += unique
    console.log(`  ${p.sheetName.padEnd(24)}  ${String(raw).padStart(4)} rows  →  ${String(unique).padStart(4)} unique`)
  }

  console.log("-".repeat(80))
  console.log(`  ${"Sum (per-sheet)".padEnd(24)}  ${String(grandRaw).padStart(4)} rows  →  ${String(grandUnique).padStart(4)} unique per-sheet`)
  console.log(`  ${"Across sheets".padEnd(24)}  ${"".padStart(4)}         →  ${String(globalKeys.size).padStart(4)} distinct components`)
  console.log("=".repeat(80))
}

main().catch((e) => { console.error(e); process.exit(1) })
