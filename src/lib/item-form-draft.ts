/**
 * sessionStorage helpers for the "Import BOM before creating the item" flow.
 *
 * The user fills the add-item form → clicks "Import BOM" → picks sheets/rows on
 * /items/import → returns to /items/add with the BOM staged and every field
 * they'd already typed still on screen. Nothing hits the database until they
 * click "Save item".
 *
 * Two payloads live under separate keys so either half can be cleared or
 * refreshed independently:
 *   • ITEM_FORM_DRAFT_KEY — snapshot of the add-item form state.
 *   • BOM_STAGING_KEY     — rows the importer parsed, waiting to attach.
 *
 * Both are best-effort. sessionStorage failures (private mode, quota) silently
 * fall back to "no draft" — the user just retypes; nothing corrupts.
 */

export const ITEM_FORM_DRAFT_KEY = "item-form-draft:v1"
export const BOM_STAGING_KEY = "item-form-bom-draft:v1"

export interface StagedBomRow {
  /** Original workbook sheet the row came from — surfaced in the preview
   *  so a mixed-sheet BOM is legible; not sent to the server. */
  source: string
  categoryId: string | null
  name: string
  partNo: string | null
  manufacturer: string | null
  supplier: string | null
  solderType: "SMD" | "DIP" | null
  footprint: string | null
  qty: number
  designator: string | null
}

export interface StagedBom {
  version: 1
  fileName: string
  rows: StagedBomRow[]
  sheetSummary: { sheetName: string; rowCount: number }[]
  stagedAt: string
}

export function readStagedBom(): StagedBom | null {
  try {
    const raw = typeof window === "undefined" ? null : window.sessionStorage.getItem(BOM_STAGING_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StagedBom
    if (parsed?.version !== 1 || !Array.isArray(parsed.rows)) return null
    return parsed
  } catch {
    return null
  }
}

export function writeStagedBom(payload: Omit<StagedBom, "version" | "stagedAt">): void {
  try {
    if (typeof window === "undefined") return
    const full: StagedBom = { ...payload, version: 1, stagedAt: new Date().toISOString() }
    window.sessionStorage.setItem(BOM_STAGING_KEY, JSON.stringify(full))
  } catch { /* quota / private mode — the caller's in-memory state stays correct */ }
}

export function clearStagedBom(): void {
  try {
    if (typeof window === "undefined") return
    window.sessionStorage.removeItem(BOM_STAGING_KEY)
  } catch { /* see writeStagedBom */ }
}

/** Opaque form snapshot — the add-item form owns the shape; this file only
 *  transports it. Kept as `unknown` so the storage layer stays decoupled from
 *  the form's field list, which changes as sections are added. */
export interface ItemFormDraft {
  version: 1
  data: unknown
  savedAt: string
}

export function readItemFormDraft(): ItemFormDraft | null {
  try {
    const raw = typeof window === "undefined" ? null : window.sessionStorage.getItem(ITEM_FORM_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ItemFormDraft
    if (parsed?.version !== 1) return null
    return parsed
  } catch {
    return null
  }
}

export function writeItemFormDraft(data: unknown): void {
  try {
    if (typeof window === "undefined") return
    const payload: ItemFormDraft = { version: 1, data, savedAt: new Date().toISOString() }
    window.sessionStorage.setItem(ITEM_FORM_DRAFT_KEY, JSON.stringify(payload))
  } catch { /* see writeStagedBom */ }
}

export function clearItemFormDraft(): void {
  try {
    if (typeof window === "undefined") return
    window.sessionStorage.removeItem(ITEM_FORM_DRAFT_KEY)
  } catch { /* see writeStagedBom */ }
}
