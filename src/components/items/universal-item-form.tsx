"use client"

/**
 * Universal Item Form (P15a extraction).
 *
 * The full "add or edit an item" form. Shared by /items/add (mode="add") and
 * /items/edit/[id] (mode="edit"). The layout is the collapsible-sections shape
 * shipped in P1–P8: Section 1 identity core, then optional Stock, Specs,
 * Manufacturer, Board, Packaging, Storage, Asset sections that reveal via
 * chip toggles.
 *
 * Modes:
 *   • add  — empty state, POST /api/items on save. Duplicate-from is
 *            available (start from an existing item).
 *   • edit — prefill every field from `initial`, PATCH /api/items/[id] on
 *            save. Duplicate-from is hidden (editing an item is not the same
 *            as cloning it), Save-as-draft still works and PATCHes with
 *            status='inactive'.
 *
 * On success, "add" routes to /items/list?id=<new>; "edit" routes to
 * /items/details/[id]. Both preserve the toast + hint flow.
 */

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ArrowLeft, Save, AlertCircle, CheckCircle2, Info,
  Nut, Cpu, Package, Boxes, Wrench, Laptop, Factory, ShoppingBag,
  Lock, Plus, Trash2, ChevronDown, ChevronRight, Sliders,
  Copy, Search, Eye, Layers, Link2,
} from "lucide-react"
import { useData } from "@/lib/data-provider"
import { CategoryCascade } from "@/components/category-cascade"
import { extractError } from "@/lib/api-error"

type ItemType = "raw" | "semi_assembled" | "assembled" | "consumable" | "asset" | "packaging"
type ItemStatus = "active" | "inactive" | "discontinued"

// One row per selectable stage. `slug` is the code prefix suggested by the
// auto-code helper when no category is chosen yet. `defaultUom` matches the
// intuitive base unit; user can override. `group` splits the picker into
// "Build stage" (raw → semi_assembled → assembled) and "Other" (consumable,
// asset, packaging) — orthogonal-to-build kinds live in their own bucket.
interface StageMeta {
  value: ItemType
  label: string
  hint: string
  slug: string
  defaultUom: string
  defaultSource: "purchased" | "manufactured"
  icon: React.ComponentType<{ className?: string }>
  tone: string
  group: "build" | "other"
}
const ITEM_TYPES: StageMeta[] = [
  { value: "raw",            label: "Raw",             hint: "Purchased material or part",             slug: "RAW", defaultUom: "PCS", defaultSource: "purchased",    icon: Nut,     tone: "border-primary/30 bg-primary/5",         group: "build" },
  { value: "semi_assembled", label: "Semi-assembled",  hint: "A sub-assembly built in-house",          slug: "SUB", defaultUom: "PCS", defaultSource: "manufactured", icon: Cpu,     tone: "border-sky-500/30 bg-sky-500/5",         group: "build" },
  { value: "assembled",      label: "Assembled",       hint: "A fully-built board or product",         slug: "FG",  defaultUom: "PCS", defaultSource: "manufactured", icon: Package, tone: "border-emerald-500/30 bg-emerald-500/5", group: "build" },
  { value: "consumable",     label: "Consumable",      hint: "Solder, flux, cleaner, adhesive, tape…", slug: "CON", defaultUom: "PCS", defaultSource: "purchased",    icon: Boxes,   tone: "border-amber-500/30 bg-amber-500/5",     group: "other" },
  { value: "asset",          label: "Asset",           hint: "IT gear, tools, machines, fixtures",     slug: "AST", defaultUom: "PCS", defaultSource: "purchased",    icon: Laptop,  tone: "border-violet-500/30 bg-violet-500/5",   group: "other" },
  { value: "packaging",      label: "Packaging",       hint: "Boxes, bags, foam, labels",              slug: "PKG", defaultUom: "PCS", defaultSource: "purchased",    icon: Wrench,  tone: "border-slate-500/30 bg-slate-500/5",     group: "other" },
]
const ITEM_TYPE_BY_VALUE: Record<ItemType, StageMeta> = Object.fromEntries(ITEM_TYPES.map((t) => [t.value, t])) as Record<ItemType, StageMeta>

const UOM_OPTIONS = ["PCS", "Reel", "Tray", "Meter", "Set", "Box", "Roll", "Kg", "Litre"]

/** Auto-suggested code. Prefers a category-slug prefix when available so items
 *  cluster naturally on the item list; falls back to the item-type slug. */
function suggestCode(name: string, itemType: ItemType, categorySlug?: string | null): string {
  const namePart = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24)
  if (!namePart) return ""
  const prefix = (categorySlug ?? ITEM_TYPE_BY_VALUE[itemType].slug).toUpperCase().slice(0, 6)
  return `${prefix}-${namePart}`
}

/** Full item shape the form knows how to prefill. Same shape returned by
 *  `GET /api/items/[id]` — see ItemView in src/lib/server/data/items.ts. */
export interface UniversalItemInitial {
  id: string; code: string; genericPn: string | null; name: string;
  description: string | null; categoryId: string | null; categoryPath: string | null;
  itemType: ItemType; baseUom: string;
  minStock: number; reorderQty: number; safetyStock: number; leadTimeDays: number | null;
  specs: unknown; status: ItemStatus;
  /** Slice 3: sellable flag. Independent of stage. */
  isFinishedGood: boolean;
  solderType: "SMD" | "DIP" | null; footprint: string | null; spq: number | null;
  packageLengthMm: number | null; packageWidthMm: number | null; packageHeightMm: number | null;
  packageWeightG: number | null; tareWeightG: number | null;
  packageMaterial: string | null; packageReusable: boolean | null;
  storageTempMinC: number | null; storageTempMaxC: number | null;
  storageHumidityMinPct: number | null; storageHumidityMaxPct: number | null;
  mslLevel: "1" | "2" | "2a" | "3" | "4" | "5" | "5a" | "6" | null;
  hazardous: boolean | null; expiryTracked: boolean | null;
  custodianUserId: string | null;
  serialNumber: string | null; purchaseDate: string | null;
  purchaseCost: number | null; warrantyMonths: number | null; usefulLifeMonths: number | null;
  salvageValue: number | null;
  depreciationMethod: "none" | "straight_line" | "reducing_balance" | null;
  conditionKind: "new" | "good" | "fair" | "poor" | "retired" | null;
  variants: { sourceKind: "purchased" | "manufactured"; brandSlug: string | null; partNo: string | null; isDefault: boolean }[];
}

export interface UniversalItemFormProps {
  mode: "add" | "edit"
  /** Required when mode="edit". Ignored in "add" mode. */
  initial?: UniversalItemInitial
}

/** Detect whether an existing item has data in an optional section — used to
 *  auto-open that section when we land in edit mode. Mirrors the visibility
 *  checks on `/items/details/[id]`. */
function initialOpenSections(i: UniversalItemInitial): SectionKey[] {
  const open: SectionKey[] = []
  if (i.minStock || i.reorderQty || i.safetyStock || i.leadTimeDays != null) open.push("stock")
  if (Array.isArray(i.specs) && (i.specs as unknown[]).length > 0)          open.push("specs")
  if (i.variants.some((v) => v.sourceKind === "purchased"))                  open.push("mfr")
  if (i.solderType || i.footprint || i.spq != null)                          open.push("board")
  if ([i.packageLengthMm, i.packageWidthMm, i.packageHeightMm, i.packageWeightG, i.tareWeightG].some((v) => v != null)
      || !!i.packageMaterial || i.packageReusable != null)                    open.push("packaging")
  if ([i.storageTempMinC, i.storageTempMaxC, i.storageHumidityMinPct, i.storageHumidityMaxPct].some((v) => v != null)
      || !!i.mslLevel || i.hazardous != null || i.expiryTracked != null)      open.push("storage")
  if (i.itemType === "asset" && (i.custodianUserId || i.serialNumber || i.purchaseDate
      || i.purchaseCost != null || i.warrantyMonths != null || i.usefulLifeMonths != null
      || i.salvageValue != null || !!i.depreciationMethod || !!i.conditionKind)) open.push("asset")
  return open
}

/** SectionKey — declared here so `initialOpenSections` above can name it.
 *  "bom" is add-mode only — edit-mode uses the dedicated /items/[id]/bom
 *  editor because existing BOMs require Draft/Active version workflow. */
type SectionKey = "stock" | "specs" | "mfr" | "board" | "packaging" | "storage" | "asset" | "bom"

// Local BOM draft line — one row in the inline "Assembly / BOM" section on
// the add form. Persisted after item POST via a two-step chain:
//   POST  /api/items/[id]/bom                → creates a Draft version
//   PATCH /api/items/[id]/bom/[versionId]    → replaces lines
// Deliberately narrower than the /items/[id]/bom editor: no preferred-brand
// picker (per-child variants aren't loaded yet in the add flow), no
// sequence, no remarks. Users add those fields later in the editor.
interface BomDraftLine {
  key: string
  childItemId: string
  childCode: string
  childName: string
  childItemType: string
  qty: string
  refDes: string
}

interface BomChildSearchResult {
  id: string; code: string; name: string; itemType: string
}

export default function UniversalItemForm({ mode, initial }: UniversalItemFormProps) {
  const router = useRouter()
  const d = useData()
  const isEdit = mode === "edit"

  const [toast, setToast] = React.useState<{ message: string; hint?: string; type: "success" | "error" | "info" } | null>(null)
  const showToast = React.useCallback((info: { message: string; hint?: string; type: "success" | "error" | "info" }) => {
    setToast(info)
    window.setTimeout(() => setToast(null), info.type === "error" ? 6000 : 3000)
  }, [])

  // ── Duplicate-from (P9): pull a full ItemView and prefill every relevant
  //  field. Identity fields that must stay unique per tenant — `code`,
  //  `genericPn`, `serialNumber`, `purchaseDate` — are deliberately NOT
  //  copied; the user re-enters them so no accidental collisions land.
  //  Hidden in edit mode (editing is not cloning). ──
  type ItemTemplate = UniversalItemInitial
  const [showDuplicate, setShowDuplicate] = React.useState(false)
  const [templates, setTemplates] = React.useState<ItemTemplate[]>([])
  const [templatesLoaded, setTemplatesLoaded] = React.useState(false)
  const [templateFilter, setTemplateFilter] = React.useState("")

  // ── Section 1: Identity ──
  //  In edit mode we seed every field from `initial`; the item type is
  //  treated as touched so the category-→-type auto-detect does not fight
  //  the caller's stored type. Code is also treated as touched so the
  //  auto-suggester does not overwrite it on the first render.
  const [itemType, setItemType] = React.useState<ItemType>(initial?.itemType ?? "raw")
  const [typeTouched, setTypeTouched] = React.useState(isEdit)
  const [sourceKind, setSourceKind] = React.useState<"purchased" | "manufactured">(
    initial?.variants.some((v) => v.sourceKind === "manufactured") ? "manufactured" : "purchased",
  )
  const [categoryId, setCategoryId] = React.useState(initial?.categoryId ?? "")
  const [name, setName] = React.useState(initial?.name ?? "")
  const [code, setCode] = React.useState(initial?.code ?? "")
  const [codeTouched, setCodeTouched] = React.useState(isEdit)
  const [genericPn, setGenericPn] = React.useState(initial?.genericPn ?? "")
  const [description, setDescription] = React.useState(initial?.description ?? "")
  const [baseUom, setBaseUom] = React.useState(initial?.baseUom ?? "PCS")
  // Slice 3: sellable flag. Independent of stage — a Populated PCB can be
  // semi_assembled AND a finished good. Defaults false in add mode; edit
  // mode reflects whatever is stored.
  const [isFinishedGood, setIsFinishedGood] = React.useState<boolean>(initial?.isFinishedGood ?? false)
  const [submitting, setSubmitting] = React.useState(false)
  const [savingDraft, setSavingDraft] = React.useState(false)

  // Inline "+ Add category" mini-form. Creates a node under the currently
  // selected category (or a new root when nothing is selected).
  const [showAddCat, setShowAddCat] = React.useState(false)
  const [newCatName, setNewCatName] = React.useState("")
  const [creatingCat, setCreatingCat] = React.useState(false)
  const handleCreateCategory = async () => {
    const nm = newCatName.trim()
    if (!nm) return
    setCreatingCat(true)
    try {
      const res = await fetch("/api/item-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nm,
          parentId: categoryId || null,
          // Suggest the current item_type as the default for the new category —
          // makes future type auto-detection point back at whatever the user
          // intended when they created this branch.
          defaultItemType: itemType,
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) return showToast({ ...extractError(body, "Failed to add category"), type: "error" })
      await d.reload()
      setCategoryId(body?.data?.id ?? categoryId)
      setNewCatName("")
      setShowAddCat(false)
      showToast({ message: `Category "${nm}" added`, type: "success" })
    } finally {
      setCreatingCat(false)
    }
  }

  // ── Optional sections (P2+): tracked as an open-set so the user can enable
  // them in any order. Each shipped section pairs with a state block below.
  // In edit mode we auto-open every section the item already has data in. ──
  const [openSections, setOpenSections] = React.useState<Set<SectionKey>>(
    () => initial ? new Set(initialOpenSections(initial)) : new Set()
  )
  const toggleSection = (k: SectionKey) => setOpenSections((prev) => {
    const next = new Set(prev)
    if (next.has(k)) next.delete(k); else next.add(k)
    return next
  })

  // ── Section: Stock Info (P2) ──
  //  Numeric fields kept as strings so inputs stay controlled; parsed on submit.
  const [minStock,     setMinStock]     = React.useState(initial?.minStock      ? String(initial.minStock)      : "")
  const [reorderQty,   setReorderQty]   = React.useState(initial?.reorderQty    ? String(initial.reorderQty)    : "")
  const [safetyStock,  setSafetyStock]  = React.useState(initial?.safetyStock   ? String(initial.safetyStock)   : "")
  const [leadTimeDays, setLeadTimeDays] = React.useState(initial?.leadTimeDays == null ? "" : String(initial.leadTimeDays))

  // ── Section: Board Info (P5) ──
  //  Solder type, footprint, SPQ — only meaningful for items that sit on a
  //  PCB (raw electronics + sub-assemblies). Chip is disabled for other types.
  const [solderType, setSolderType] = React.useState<"SMD" | "DIP">(initial?.solderType ?? "SMD")
  const [footprint,  setFootprint]  = React.useState(initial?.footprint ?? "")
  const [spq,        setSpq]        = React.useState(initial?.spq == null ? "" : String(initial.spq))
  const boardApplicable = itemType === "raw" || itemType === "semi_assembled"
  // Close the section automatically when the item type changes to something
  // where board data doesn't apply — avoids submitting stale board data for
  // an asset the user later reclassified.
  React.useEffect(() => {
    if (!boardApplicable && openSections.has("board")) {
      setOpenSections((prev) => { const n = new Set(prev); n.delete("board"); return n })
    }
  }, [boardApplicable, openSections])

  // ── Section: Packaging Info (P6) ──
  //  All optional; the user can fill any subset. Numeric fields go in as
  //  strings so the input stays controlled — parsed at submit.
  const [pkgLen,      setPkgLen]      = React.useState(initial?.packageLengthMm == null ? "" : String(initial.packageLengthMm))
  const [pkgWid,      setPkgWid]      = React.useState(initial?.packageWidthMm  == null ? "" : String(initial.packageWidthMm))
  const [pkgHei,      setPkgHei]      = React.useState(initial?.packageHeightMm == null ? "" : String(initial.packageHeightMm))
  const [pkgWeight,   setPkgWeight]   = React.useState(initial?.packageWeightG  == null ? "" : String(initial.packageWeightG))
  const [tareWeight,  setTareWeight]  = React.useState(initial?.tareWeightG     == null ? "" : String(initial.tareWeightG))
  const [pkgMaterial, setPkgMaterial] = React.useState(initial?.packageMaterial ?? "")
  const [pkgReusable, setPkgReusable] = React.useState<boolean | null>(initial?.packageReusable ?? null)

  // ── Section: Storage / MSL (P7) ──
  //  All optional. min > max is refused at the server; the UI accepts open
  //  ranges (fill just min or just max) so single-sided limits work.
  type MslLevel = "1" | "2" | "2a" | "3" | "4" | "5" | "5a" | "6"
  const [tempMin,       setTempMin]       = React.useState(initial?.storageTempMinC       == null ? "" : String(initial.storageTempMinC))
  const [tempMax,       setTempMax]       = React.useState(initial?.storageTempMaxC       == null ? "" : String(initial.storageTempMaxC))
  const [rhMin,         setRhMin]         = React.useState(initial?.storageHumidityMinPct == null ? "" : String(initial.storageHumidityMinPct))
  const [rhMax,         setRhMax]         = React.useState(initial?.storageHumidityMaxPct == null ? "" : String(initial.storageHumidityMaxPct))
  const [msl,           setMsl]           = React.useState<MslLevel | "">(initial?.mslLevel ?? "")
  const [hazardous,     setHazardous]     = React.useState<boolean>(!!initial?.hazardous)
  const [expiryTracked, setExpiryTracked] = React.useState<boolean>(!!initial?.expiryTracked)

  // ── Section: Asset Details (P8) ──
  //  Custodian pick pulls from GET /api/users; loaded lazily when the section
  //  opens. Everything else is captured as strings and parsed on submit.
  type ItemCondition       = "new" | "good" | "fair" | "poor" | "retired"
  type ItemDepreciationKind = "none" | "straight_line" | "reducing_balance"
  interface TenantUser { id: string; name: string; email: string }
  const [tenantUsers, setTenantUsers] = React.useState<TenantUser[]>([])
  const [tenantUsersLoaded, setTenantUsersLoaded] = React.useState(false)
  const assetApplicable = itemType === "asset"

  const [custodianUserId,    setCustodianUserId]    = React.useState<string>(initial?.custodianUserId ?? "")
  const [serialNumber,       setSerialNumber]       = React.useState(initial?.serialNumber ?? "")
  const [purchaseDate,       setPurchaseDate]       = React.useState(initial?.purchaseDate ?? "")
  const [purchaseCost,       setPurchaseCost]       = React.useState(initial?.purchaseCost    == null ? "" : String(initial.purchaseCost))
  const [warrantyMonths,     setWarrantyMonths]     = React.useState(initial?.warrantyMonths  == null ? "" : String(initial.warrantyMonths))
  const [usefulLifeMonths,   setUsefulLifeMonths]   = React.useState(initial?.usefulLifeMonths == null ? "" : String(initial.usefulLifeMonths))
  const [salvageValue,       setSalvageValue]       = React.useState(initial?.salvageValue    == null ? "" : String(initial.salvageValue))
  const [depreciationMethod, setDepreciationMethod] = React.useState<ItemDepreciationKind | "">(initial?.depreciationMethod ?? "")
  const [conditionKind,      setConditionKind]      = React.useState<ItemCondition | "">(initial?.conditionKind ?? "")

  const loadTenantUsers = React.useCallback(async () => {
    try {
      const res = await fetch("/api/users", { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (res.ok) setTenantUsers((body?.data ?? []) as TenantUser[])
      setTenantUsersLoaded(true)
    } catch { setTenantUsersLoaded(true) }
  }, [])
  React.useEffect(() => {
    if (openSections.has("asset") && !tenantUsersLoaded) void loadTenantUsers()
  }, [openSections, tenantUsersLoaded, loadTenantUsers])

  // Close the asset section if the user reclassifies away from asset.
  React.useEffect(() => {
    if (!assetApplicable && openSections.has("asset")) {
      setOpenSections((prev) => { const n = new Set(prev); n.delete("asset"); return n })
    }
  }, [assetApplicable, openSections])

  // ── Section: Manufacturer variants (P3) ──
  //  Brand + MPN + default toggle. Opening stock is deferred until F5.4 lets
  //  the ledger accept rows keyed only on item_variant_id.
  interface MfrRow { brand: string; partNo: string; isDefault: boolean }
  const [mfrRows, setMfrRows] = React.useState<MfrRow[]>(() => {
    // Seed from existing purchased variants when editing; otherwise start
    // with a single empty row (matches add-form default).
    const seeded = (initial?.variants ?? [])
      .filter((v) => v.sourceKind === "purchased")
      .map((v) => ({ brand: v.brandSlug ?? "", partNo: v.partNo ?? "", isDefault: v.isDefault }))
    return seeded.length > 0 ? seeded : [{ brand: "", partNo: "", isDefault: true }]
  })
  const addMfr    = () => setMfrRows([...mfrRows, { brand: "", partNo: "", isDefault: false }])
  const removeMfr = (i: number) => setMfrRows(mfrRows.filter((_, j) => j !== i))
  const updateMfr = (i: number, field: keyof MfrRow, val: string | boolean) => {
    const next = [...mfrRows]
    // Default toggle is exclusive — only one row can be default at a time.
    if (field === "isDefault" && val === true) {
      next.forEach((r, j) => { next[j] = { ...r, isDefault: j === i } })
    } else {
      next[i] = { ...next[i], [field]: val } as MfrRow
    }
    setMfrRows(next)
  }

  // ── Section: Assembly / BOM (add-mode only, F6.4 B1 hook) ──
  //  Users can seed the item's first BOM Draft directly from this form —
  //  saves a round-trip to /items/[id]/bom after creation. On submit we
  //  chain: item POST → POST /bom (Draft) → PATCH /bom/[versionId] (lines).
  //
  //  UX modeled on the PCB "Add Manually" modal (PcbForm) — typeahead
  //  in-row on the Name field, matches appear in an absolute dropdown
  //  as you type, click to link. A green Link2 icon marks a linked row;
  //  typing edits the name and clears the link (back to unlinked).
  //
  //  KEY DIFFERENCE FROM PCB FORM: `item_bom_lines.child_item_id` is a
  //  NOT NULL FK — we cannot ship "new part will be created" on the fly.
  //  Unlinked rows are refused at submit with a clear "pick a match" hint.
  //
  //  Deliberately narrower than the full editor: child + qty + ref-des.
  //  Preferred brand / sequence / remarks are added later in the editor.
  const [bomLines, setBomLines]        = React.useState<BomDraftLine[]>([])
  const [bomOpenRow, setBomOpenRow]    = React.useState<string | null>(null)  // key of the row whose typeahead is open
  const [bomMatches, setBomMatches]    = React.useState<Record<string, BomChildSearchResult[]>>({})
  const bomApplicable = itemType !== "raw"

  const newBomLine = (): BomDraftLine => ({
    key: `bom-${(globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2))}`,
    childItemId: "", childCode: "", childName: "", childItemType: "raw",
    qty: "1", refDes: "",
  })
  const addBomLine = () => setBomLines((prev) => [...prev, newBomLine()])
  const removeBomLine = (key: string) => setBomLines((prev) => prev.filter((l) => l.key !== key))
  const patchBomLine = (key: string, patch: Partial<BomDraftLine>) =>
    setBomLines((prev) => prev.map((l) => l.key === key ? { ...l, ...patch } : l))

  // Typing in Name: update text, clear any prior link. Query drives the
  // typeahead dropdown for THIS row only (openRow gates visibility).
  const onBomNameChange = (key: string, value: string) => {
    patchBomLine(key, { childName: value, childItemId: "", childCode: "", childItemType: "raw" })
    setBomOpenRow(value.trim() ? key : null)
  }

  // Debounced /api/items lookup per open row. Cheap — one query at a time.
  React.useEffect(() => {
    if (!bomOpenRow) return
    const row = bomLines.find((l) => l.key === bomOpenRow)
    if (!row) return
    const q = row.childName.trim()
    if (!q) { setBomMatches((prev) => ({ ...prev, [bomOpenRow]: [] })); return }
    let cancelled = false
    const t = window.setTimeout(async () => {
      const res = await fetch(`/api/items?q=${encodeURIComponent(q)}`, { cache: "no-store" })
      if (cancelled) return
      if (res.ok) {
        const b = await res.json() as { data: BomChildSearchResult[] }
        setBomMatches((prev) => ({ ...prev, [bomOpenRow]: b.data.slice(0, 8) }))
      }
    }, 180)
    return () => { cancelled = true; window.clearTimeout(t) }
  }, [bomOpenRow, bomLines])

  const pickBomChild = (key: string, picked: BomChildSearchResult) => {
    patchBomLine(key, { childItemId: picked.id, childCode: picked.code, childName: picked.name, childItemType: picked.itemType })
    setBomOpenRow(null)
  }

  // Auto-close the section if the stage flips to raw (nothing there is valid).
  React.useEffect(() => {
    if (!bomApplicable && openSections.has("bom")) {
      setOpenSections((prev) => { const n = new Set(prev); n.delete("bom"); return n })
    }
  }, [bomApplicable, openSections])

  // ── Section: Specifications (P2) — free-form key/value bag ──
  interface Spec { key: string; value: string }
  const [specs, setSpecs] = React.useState<Spec[]>(() => {
    const s = Array.isArray(initial?.specs) ? (initial!.specs as unknown[]) : []
    const seeded = s.filter((x): x is Spec => !!x && typeof x === "object" && "key" in x)
      .map((x) => ({ key: String((x as Spec).key ?? ""), value: String((x as Spec).value ?? "") }))
      .filter((x) => x.key)
    return seeded.length > 0 ? seeded : [{ key: "", value: "" }]
  })
  const addSpec    = () => setSpecs([...specs, { key: "", value: "" }])
  const removeSpec = (i: number) => setSpecs(specs.filter((_, j) => j !== i))
  const updateSpec = (i: number, field: keyof Spec, val: string) => {
    const next = [...specs]
    next[i] = { ...next[i], [field]: val }
    setSpecs(next)
  }

  // Switching stage toggles the default source (a finished good is always
  // manufactured, a raw part is always purchased), the default UOM, and — if
  // the current category no longer belongs to this stage — clears the picker
  // so the user re-picks from the (now stage-scoped) list. One-way flow:
  // Stage → Category. There is no reverse Category → Stage auto-detect
  // any more (Slice 2 makes categories a proper subset of a stage).
  const handlePickType = (t: ItemType) => {
    const meta = ITEM_TYPE_BY_VALUE[t]
    setItemType(t)
    setTypeTouched(true)
    setSourceKind(meta.defaultSource)
    setBaseUom(meta.defaultUom)
    const cat = d.getCategory(categoryId)
    if (cat && cat.defaultItemType && cat.defaultItemType !== t) setCategoryId("")
  }

  // Auto-suggest a code from name/category/type, but stop the moment the user
  // types into the code field (respect their edit).
  React.useEffect(() => {
    if (codeTouched) return
    const cat = d.getCategory(categoryId)
    setCode(suggestCode(name, itemType, cat?.slug))
  }, [name, categoryId, itemType, codeTouched, d])

  const submit = async (e: React.FormEvent, options: { asDraft?: boolean } = {}) => {
    e.preventDefault()
    if (!name.trim())  return showToast({ message: "Item name is required", type: "error" })
    if (!code.trim())  return showToast({ message: "Item code is required", type: "error" })
    // Drafts land as `inactive` — hidden from most default filters until the
    // user comes back and flips them active. Everything else keeps its normal
    // pre-submit checks.
    const submitStatus: ItemStatus = options.asDraft ? "inactive" : "active"
    const setBusy = options.asDraft ? setSavingDraft : setSubmitting

    // Only forward Stock/Specs fields when their section is open — closed
    // sections mean "not applicable to this item", not "zero". This matches
    // the pattern used elsewhere (undefined = untouched, 0 = intentional).
    const stockOpen = openSections.has("stock")
    const specsOpen = openSections.has("specs")
    const mfrOpen   = openSections.has("mfr")
    const boardOpen = openSections.has("board") && boardApplicable
    const packagingOpen = openSections.has("packaging")
    const storageOpen = openSections.has("storage")
    const assetOpen   = openSections.has("asset") && assetApplicable
    const bomOpen     = openSections.has("bom") && bomApplicable && !isEdit
    const cleanedSpecs = specs.filter((s) => s.key.trim() !== "")
    const cleanedMfrs  = mfrRows.filter((r) => r.brand.trim() !== "")

    // BOM guard: any row where the user typed a name but never picked a
    // match from the typeahead is a hard error — item_bom_lines.child_item_id
    // is a NOT NULL FK, we cannot ship those to the server.
    if (bomOpen) {
      const unlinked = bomLines.filter((l) => l.childName.trim() !== "" && !l.childItemId)
      if (unlinked.length > 0) {
        return showToast({
          message: `Pick a catalog match for ${unlinked.length} BOM line${unlinked.length === 1 ? "" : "s"}`,
          hint: unlinked.map((l) => `"${l.childName}"`).join(", ") + " — start typing again to pick from the dropdown, or remove the row.",
          type: "error",
        })
      }
    }

    // Identity guard: every item must be identifiable by SOMETHING beyond its
    // internal SKU — either a generic part number OR at least one manufacturer
    // part number. This mirrors the request ("either MPN or Generic PN").
    const hasMpn = mfrOpen && cleanedMfrs.some((r) => r.partNo.trim() !== "")
    if (!genericPn.trim() && !hasMpn) {
      return showToast({
        message: "Enter a Generic Part No. or at least one Manufacturer Part No.",
        hint: mfrOpen
          ? "Fill the Generic PN in Section 1 or add an MPN to the Manufacturer section."
          : "Fill the Generic PN in Section 1, or open Manufacturer Info and add an MPN.",
        type: "error",
      })
    }

    const numOrUndef = (s: string) => s.trim() === "" ? undefined : Number(s)
    const intOrUndef = (s: string) => s.trim() === "" ? undefined : Number.parseInt(s, 10)

    setBusy(true)
    try {
      // Add mode → POST /api/items ; edit mode → PATCH /api/items/[id].
      // In edit mode the item's id is stable and comes back from the PATCH.
      const url    = isEdit && initial ? `/api/items/${initial.id}` : "/api/items"
      const method = isEdit ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          genericPn: genericPn.trim() || null,
          name: name.trim(),
          description: description.trim() || null,
          categoryId: categoryId || null,
          // Item type is immutable after create — F1 keeps it as a load-bearing
          // enum, so we only send it in add mode. PATCH ignores unknown keys
          // but we drop it explicitly for clarity.
          ...(isEdit ? {} : { itemType }),
          baseUom,
          status: submitStatus,
          isFinishedGood,
          ...(stockOpen ? {
            minStock:     numOrUndef(minStock),
            reorderQty:   numOrUndef(reorderQty),
            safetyStock:  numOrUndef(safetyStock),
            leadTimeDays: intOrUndef(leadTimeDays),
          } : {}),
          ...(specsOpen && cleanedSpecs.length ? { specs: cleanedSpecs } : {}),
          ...(boardOpen ? {
            solderType,
            footprint: footprint.trim() || null,
            spq: spq.trim() === "" ? null : Number.parseInt(spq, 10),
          } : {}),
          ...(packagingOpen ? {
            packageLengthMm: pkgLen.trim()     === "" ? null : Number(pkgLen),
            packageWidthMm:  pkgWid.trim()     === "" ? null : Number(pkgWid),
            packageHeightMm: pkgHei.trim()     === "" ? null : Number(pkgHei),
            packageWeightG:  pkgWeight.trim()  === "" ? null : Number(pkgWeight),
            tareWeightG:     tareWeight.trim() === "" ? null : Number(tareWeight),
            packageMaterial: pkgMaterial.trim() || null,
            packageReusable: pkgReusable,
          } : {}),
          ...(storageOpen ? {
            storageTempMinC:       tempMin.trim() === "" ? null : Number(tempMin),
            storageTempMaxC:       tempMax.trim() === "" ? null : Number(tempMax),
            storageHumidityMinPct: rhMin.trim()   === "" ? null : Number(rhMin),
            storageHumidityMaxPct: rhMax.trim()   === "" ? null : Number(rhMax),
            mslLevel:              msl === "" ? null : msl,
            hazardous,
            expiryTracked,
          } : {}),
          ...(assetOpen ? {
            custodianUserId:    custodianUserId || null,
            serialNumber:       serialNumber.trim() || null,
            purchaseDate:       purchaseDate || null,
            purchaseCost:       purchaseCost.trim()     === "" ? null : Number(purchaseCost),
            warrantyMonths:     warrantyMonths.trim()   === "" ? null : Number.parseInt(warrantyMonths, 10),
            usefulLifeMonths:   usefulLifeMonths.trim() === "" ? null : Number.parseInt(usefulLifeMonths, 10),
            salvageValue:       salvageValue.trim()     === "" ? null : Number(salvageValue),
            depreciationMethod: depreciationMethod || null,
            conditionKind:      conditionKind || null,
          } : {}),
          // sourceKind is captured in Section-1 state but not sent yet — the F1
          // create endpoint keys source on the variant, not the item. P3 posts
          // brand variants as a follow-up POST /api/items/[id]/variants instead
          // (the endpoint accepts brand names and resolves them server-side,
          // which we do not do inline in createItem's variants[] input).
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) return showToast({ ...extractError(body, isEdit ? "Failed to save item" : "Failed to create item"), type: "error" })
      const savedId = (body?.data?.id as string | undefined) ?? initial?.id

      // Variant POSTs are ADD-mode only. In edit mode users manage variants
      // via a dedicated flow (F5.6 territory) — blindly POSTing existing
      // brand pairs would 409, and diffing add-vs-remove is a full feature
      // of its own. So we skip the block on edit.
      const failed: string[] = []
      if (!isEdit && mfrOpen && savedId && cleanedMfrs.length) {
        for (const r of cleanedMfrs) {
          const vr = await fetch(`/api/items/${savedId}/variants`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              brand: r.brand.trim(),
              partNo: r.partNo.trim() || null,
              isDefault: r.isDefault,
            }),
          })
          if (!vr.ok) {
            const vb = await vr.json().catch(() => null)
            failed.push(`${r.brand.trim()}: ${extractError(vb, "failed").message}`)
          }
        }
      }

      // Chain BOM POST + PATCH — add-mode only. Any valid line in the
      // section seeds a Draft version. On any failure we surface it in the
      // toast but the item itself stays created (partial success).
      let bomVersionId: string | null = null
      const validBomLines = bomLines.filter(
        (l) => l.childItemId && Number.isFinite(Number(l.qty)) && Number(l.qty) > 0,
      )
      if (!isEdit && bomApplicable && openSections.has("bom") && savedId && validBomLines.length > 0) {
        try {
          const cRes = await fetch(`/api/items/${savedId}/bom`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          })
          const cBody = await cRes.json().catch(() => null)
          if (!cRes.ok) {
            failed.push(`BOM version: ${extractError(cBody, "failed to create version").message}`)
          } else {
            bomVersionId = (cBody?.data?.selectedVersionId as string | null) ?? null
            if (bomVersionId) {
              const pRes = await fetch(`/api/items/${savedId}/bom/${bomVersionId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  lines: validBomLines.map((l) => ({
                    childItemId: l.childItemId,
                    qty: Number(l.qty),
                    refDes: l.refDes.trim() || null,
                  })),
                }),
              })
              if (!pRes.ok) {
                const pBody = await pRes.json().catch(() => null)
                failed.push(`BOM lines: ${extractError(pBody, "failed to save lines").message}`)
              }
            }
          }
        } catch (err) {
          failed.push(`BOM: ${err instanceof Error ? err.message : "unexpected error"}`)
        }
      }

      if (failed.length) {
        showToast({
          message: `Item created, but ${failed.length} follow-up step(s) failed`,
          hint: failed.join(" · "),
          type: "error",
        })
      } else {
        const label = code.trim()
        showToast({
          message: options.asDraft
            ? `Draft saved: ${label}`
            : isEdit ? `Updated ${label}` : `Created ${label}`,
          hint: options.asDraft ? "Item is inactive and hidden from active filters. Edit later to activate." : undefined,
          type: "success",
        })
      }
      // If we seeded a BOM Draft, drop the user in the BOM editor to Activate.
      // Otherwise fall back to the usual details-in-list or details page.
      const target = bomVersionId && savedId
        ? `/items/${savedId}/bom`
        : isEdit && savedId
          ? `/items/details/${savedId}`
          : savedId ? `/items/list?id=${savedId}` : "/items/list"
      window.setTimeout(() => router.push(target), failed.length ? 2500 : 700)
    } finally {
      setBusy(false)
    }
  }

  const typeMeta = ITEM_TYPE_BY_VALUE[itemType]

  // ── Duplicate-from: load templates lazily; prefill state from a chosen one. ──
  const loadTemplates = React.useCallback(async () => {
    try {
      const res = await fetch("/api/items", { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (res.ok) setTemplates((body?.data ?? []) as ItemTemplate[])
      setTemplatesLoaded(true)
    } catch { setTemplatesLoaded(true) }
  }, [])
  React.useEffect(() => {
    if (showDuplicate && !templatesLoaded) void loadTemplates()
  }, [showDuplicate, templatesLoaded, loadTemplates])

  const prefillFrom = (src: ItemTemplate) => {
    // Section 1 — identity keys are NOT copied (code, genericPN, serial).
    setItemType(src.itemType)
    setTypeTouched(true)
    setSourceKind(src.variants.some((v) => v.sourceKind === "manufactured") ? "manufactured" : "purchased")
    setCategoryId(src.categoryId ?? "")
    setName(`${src.name} (Copy)`)
    setCodeTouched(false); setCode("")
    setGenericPn("")
    setDescription(src.description ?? "")
    setBaseUom(src.baseUom)
    setIsFinishedGood(!!src.isFinishedGood)

    const openSet = new Set<SectionKey>()
    if (src.minStock || src.reorderQty || src.safetyStock || src.leadTimeDays != null) {
      openSet.add("stock")
      setMinStock(src.minStock ? String(src.minStock) : "")
      setReorderQty(src.reorderQty ? String(src.reorderQty) : "")
      setSafetyStock(src.safetyStock ? String(src.safetyStock) : "")
      setLeadTimeDays(src.leadTimeDays == null ? "" : String(src.leadTimeDays))
    }
    if (Array.isArray(src.specs) && src.specs.length) {
      openSet.add("specs")
      setSpecs(src.specs as Spec[])
    }
    if (src.solderType || src.footprint || src.spq != null) {
      openSet.add("board")
      setSolderType(src.solderType ?? "SMD")
      setFootprint(src.footprint ?? "")
      setSpq(src.spq == null ? "" : String(src.spq))
    }
    if (src.packageLengthMm != null || src.packageWidthMm != null || src.packageHeightMm != null
        || src.packageWeightG != null || src.tareWeightG != null || src.packageMaterial || src.packageReusable != null) {
      openSet.add("packaging")
      setPkgLen(src.packageLengthMm == null ? "" : String(src.packageLengthMm))
      setPkgWid(src.packageWidthMm  == null ? "" : String(src.packageWidthMm))
      setPkgHei(src.packageHeightMm == null ? "" : String(src.packageHeightMm))
      setPkgWeight(src.packageWeightG == null ? "" : String(src.packageWeightG))
      setTareWeight(src.tareWeightG == null ? "" : String(src.tareWeightG))
      setPkgMaterial(src.packageMaterial ?? "")
      setPkgReusable(src.packageReusable)
    }
    if (src.storageTempMinC != null || src.storageTempMaxC != null
        || src.storageHumidityMinPct != null || src.storageHumidityMaxPct != null
        || src.mslLevel || src.hazardous != null || src.expiryTracked != null) {
      openSet.add("storage")
      setTempMin(src.storageTempMinC == null ? "" : String(src.storageTempMinC))
      setTempMax(src.storageTempMaxC == null ? "" : String(src.storageTempMaxC))
      setRhMin(src.storageHumidityMinPct == null ? "" : String(src.storageHumidityMinPct))
      setRhMax(src.storageHumidityMaxPct == null ? "" : String(src.storageHumidityMaxPct))
      setMsl(src.mslLevel ?? "")
      setHazardous(!!src.hazardous)
      setExpiryTracked(!!src.expiryTracked)
    }
    if (src.itemType === "asset" && (src.custodianUserId || src.purchaseCost != null
        || src.warrantyMonths != null || src.usefulLifeMonths != null
        || src.depreciationMethod || src.conditionKind)) {
      openSet.add("asset")
      setCustodianUserId(src.custodianUserId ?? "")
      setSerialNumber("")           // never copy — tenant-unique
      setPurchaseDate("")           // per-instance; reset
      setPurchaseCost(src.purchaseCost == null ? "" : String(src.purchaseCost))
      setWarrantyMonths(src.warrantyMonths == null ? "" : String(src.warrantyMonths))
      setUsefulLifeMonths(src.usefulLifeMonths == null ? "" : String(src.usefulLifeMonths))
      setSalvageValue(src.salvageValue == null ? "" : String(src.salvageValue))
      setDepreciationMethod(src.depreciationMethod ?? "")
      setConditionKind(src.conditionKind ?? "")
    }

    setOpenSections(openSet)
    setShowDuplicate(false)
    setTemplateFilter("")
    showToast({ message: `Started from ${src.code}`, hint: "Fill in a new code and generic PN — everything else is prefilled.", type: "success" })
  }

  const filteredTemplates = React.useMemo(() => {
    const q = templateFilter.trim().toLowerCase()
    if (!q) return templates.slice(0, 50)
    return templates
      .filter((t) => `${t.code} ${t.name} ${t.categoryPath ?? ""}`.toLowerCase().includes(q))
      .slice(0, 50)
  }, [templates, templateFilter])

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-8">
        <div className="space-y-6 min-w-0">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-[70] max-w-md flex items-start gap-2 px-4 py-3 rounded-lg border shadow-lg bg-background animate-in fade-in slide-in-from-bottom-5 ${
          toast.type === "success" ? "border-emerald-500/35 text-emerald-600 dark:text-emerald-400"
          : toast.type === "error" ? "border-destructive/35 text-destructive"
          : "border-primary/35 text-primary"
        }`}>
          {toast.type === "success" ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
            : toast.type === "error" ? <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
            : <Info className="h-4 w-4 mt-0.5 shrink-0 text-primary" />}
          <div className="min-w-0">
            <div className="text-sm font-semibold">{toast.message}</div>
            {toast.hint && <div className="mt-1 text-xs font-medium text-muted-foreground">{toast.hint}</div>}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-muted-foreground flex items-center gap-2 font-medium">
            <Link href="/items/list" className="hover:text-foreground transition-colors">Items</Link>
            <span>/</span>
            {isEdit && initial && (
              <>
                <Link href={`/items/details/${initial.id}`} className="hover:text-foreground transition-colors truncate max-w-[240px]">{initial.name}</Link>
                <span>/</span>
              </>
            )}
            <span className="text-foreground font-semibold">{isEdit ? "Edit" : "Add Item"}</span>
            <span className="ml-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400 tracking-wide">
              UNIVERSAL
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            {isEdit ? `Edit ${initial?.code ?? "item"}` : "Add a new item"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEdit
              ? "Change any field, then save. Item type is fixed after create."
              : "One form for everything you hold — raw parts, sub-assemblies, finished goods, consumables, IT assets, and packaging."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Duplicate-from is add-mode only — cloning during an edit would
              overwrite the item's identity with another's. */}
          {!isEdit && (
            <Button type="button" variant="outline" onClick={() => setShowDuplicate((v) => !v)} className="gap-1.5">
              <Copy className="h-4 w-4" /> {showDuplicate ? "Cancel" : "Start from existing"}
            </Button>
          )}
          <Link
            href={isEdit && initial ? `/items/details/${initial.id}` : "/items/list"}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold hover:bg-muted/30"
          >
            <ArrowLeft className="h-4 w-4" /> {isEdit ? "Back to details" : "Back to Items"}
          </Link>
        </div>
      </div>

      {/* Duplicate-from picker (P9) — add mode only */}
      {!isEdit && showDuplicate && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
          <div className="flex items-start gap-2">
            <Copy className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground">Start from an existing item</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Prefills every field except the identity keys (item code, generic PN, serial, purchase date). Search by code, name, or category.
              </p>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={templateFilter}
              onChange={(e) => setTemplateFilter(e.target.value)}
              placeholder="Search items…"
              className="pl-9 h-9 bg-background"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-background divide-y divide-border">
            {!templatesLoaded && <div className="p-3 text-xs text-muted-foreground italic">Loading items…</div>}
            {templatesLoaded && filteredTemplates.length === 0 && (
              <div className="p-3 text-xs text-muted-foreground italic">No items match "{templateFilter}"</div>
            )}
            {filteredTemplates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => prefillFrom(t)}
                className="w-full text-left px-3 py-2 hover:bg-muted/40 cursor-pointer flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">
                    {t.code}{t.genericPn ? ` · ${t.genericPn}` : ""}{t.categoryPath ? ` · ${t.categoryPath}` : ""}
                  </div>
                </div>
                <span className="shrink-0 text-[10px] font-bold uppercase rounded-full border border-border bg-muted/30 px-2 py-0.5 text-muted-foreground">
                  {t.itemType.replace("_", " ")}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        {/* ─── Section 1: Identity ─── */}
        <Card className="border border-border shadow-sm">
          <CardHeader className="bg-muted/10 border-b border-border/60 py-4 px-6">
            <CardTitle className="text-lg font-bold text-foreground">Section 1 — Identity</CardTitle>
            <CardDescription>Type, category, code, name — the core of every item.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {/* Stage picker — two groups: Build stage + Other. Item type in the
                DB is still `item_type`; this UI just labels it "Stage" so it
                reads naturally to a manufacturing person. */}
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                Stage
                {isEdit && <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground/80 normal-case tracking-normal"><Lock className="h-3 w-3" /> keep in mind: changing stage on an existing item reclassifies it everywhere</span>}
              </label>
              {(["build", "other"] as const).map((group) => {
                const stages = ITEM_TYPES.filter((t) => t.group === group)
                return (
                  <div key={group} className="space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {group === "build" ? "Build stage" : "Other"}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {stages.map((t) => {
                        const Icon = t.icon
                        const active = itemType === t.value
                        return (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => handlePickType(t.value)}
                            className={`text-left rounded-lg border px-3 py-2.5 transition-all cursor-pointer ${
                              active ? `${t.tone} border-primary/60 shadow-3xs` : "border-border bg-background hover:bg-muted/30"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                              <span className={`text-sm font-bold ${active ? "text-primary" : "text-foreground"}`}>{t.label}</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">{t.hint}</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Source toggle */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Source</label>
              <div className="flex items-center gap-2">
                {(["purchased", "manufactured"] as const).map((s) => {
                  const active = sourceKind === s
                  const Icon = s === "purchased" ? ShoppingBag : Factory
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSourceKind(s)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                        active ? "border-primary/60 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted/30"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {s === "purchased" ? "Purchased" : "Made in-house"}
                    </button>
                  )
                })}
                <span className="text-[11px] text-muted-foreground italic ml-1">
                  Drives the Manufacturer section in a later phase — for now it's a hint on the item.
                </span>
              </div>
            </div>

            {/* Finished-good flag (Slice 3). Independent of stage — a Populated
                PCB can be semi_assembled AND sellable. Feeds the future sales
                module; nothing else consumes it yet. */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Role</label>
              <label className="flex items-start gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors">
                <input
                  type="checkbox"
                  checked={isFinishedGood}
                  onChange={(e) => setIsFinishedGood(e.target.checked)}
                  className="mt-0.5 h-4 w-4 cursor-pointer"
                />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-foreground">This is a finished good (we sell it)</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Independent of stage — a Populated PCB can be a sub-assembly <em>and</em> a finished good. Feeds the sales module.
                  </div>
                </div>
              </label>
            </div>

            {/* Category — filtered to the chosen stage */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Category <span className="normal-case tracking-normal text-[10px] font-medium text-muted-foreground/80">(within {ITEM_TYPE_BY_VALUE[itemType].label})</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowAddCat((v) => !v)}
                  className="text-[11px] font-semibold text-primary hover:underline cursor-pointer inline-flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> {showAddCat ? "Cancel" : "Add category"}
                </button>
              </div>
              <CategoryCascade value={categoryId} onChange={setCategoryId} allLabel="— Select a category —" stageFilter={itemType} />
              {showAddCat && (
                <div className="rounded-lg border border-border bg-muted/10 p-3 space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    New category will be added {categoryId
                      ? <>under <span className="font-mono text-foreground">{d.getCategory(categoryId)?.path}</span></>
                      : "as a top-level root"}, under stage <span className="font-mono text-foreground">{ITEM_TYPE_BY_VALUE[itemType].label}</span>.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleCreateCategory() } }}
                      placeholder="e.g. Jumper Wires"
                      className="h-8 text-sm flex-1"
                    />
                    <Button type="button" size="sm" onClick={handleCreateCategory} disabled={creatingCat || !newCatName.trim()} className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> {creatingCat ? "Adding…" : "Add"}
                    </Button>
                  </div>
                </div>
              )}
              <span className="text-[11px] text-muted-foreground">
                Categories are scoped to the stage picked above. Change the stage to see a different set.
              </span>
            </div>

            {/* Name + code + Generic PN */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Item name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder='e.g. MSI Prestige 14, 10kΩ 0603 Resistor, "Solder Wire 63/37"'
                  className="h-9"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  Item code (internal SKU)
                  {!codeTouched && code && <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground/80 normal-case tracking-normal">
                    <Lock className="h-3 w-3" /> auto-suggested
                  </span>}
                </label>
                <Input
                  value={code}
                  onChange={(e) => { setCodeTouched(true); setCode(e.target.value) }}
                  placeholder="e.g. AST-MSI-PRESTIGE-14"
                  className="h-9 font-mono"
                  required
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  Generic Part No.
                  <span className="text-[10px] font-medium text-muted-foreground/80 normal-case tracking-normal">
                    industry/in-house PN — required if no MPN
                  </span>
                </label>
                <Input
                  value={genericPn}
                  onChange={(e) => setGenericPn(e.target.value)}
                  placeholder='e.g. 10K-0603-1%, USB-A-M, "JEDEC-TO-220"'
                  className="h-9 font-mono"
                />
                <span className="text-[11px] text-muted-foreground">
                  Every item needs at least one of: <b>Generic PN</b> here, or a <b>Manufacturer Part No.</b> in the Manufacturer section below.
                </span>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short human-readable description shown on lists and detail pages"
                rows={3}
                className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Base UOM */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Base UOM</label>
                <select
                  value={baseUom}
                  onChange={(e) => setBaseUom(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
                >
                  {UOM_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <span className="text-[11px] text-muted-foreground">Unit used when you count, buy, and issue this item.</span>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Selected type</label>
                <div className="h-9 flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 text-sm">
                  <typeMeta.icon className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{typeMeta.label}</span>
                  <span className="text-muted-foreground text-xs ml-1">· {typeMeta.hint}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* "Add more info" chip strip — chips whose sections have shipped are
            interactive; the rest are placeholders labeled with their phase tag. */}
        <div className="rounded-xl border border-dashed border-border bg-muted/10 p-5 space-y-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-bold text-foreground">Add more info</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Click a chip to reveal that section — fill only what applies. You can save any time; unopened sections are treated as "not applicable".</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {([
              { key: "stock",     shipped: true, label: "Stock Info",         icon: Boxes,   phase: "P2", disabled: false },
              { key: "specs",     shipped: true, label: "Specifications",     icon: Sliders, phase: "P2", disabled: false },
              { key: "mfr",       shipped: true, label: "Manufacturer Info",  icon: Factory, phase: "P3", disabled: false },
              { key: "board",     shipped: true, label: "Board Info",         icon: Cpu,     phase: "P5", disabled: !boardApplicable },
              { key: "packaging", shipped: true, label: "Packaging Info",     icon: Package, phase: "P6", disabled: false },
              { key: "storage",   shipped: true, label: "Storage / MSL",      icon: Wrench,  phase: "P7", disabled: false },
              { key: "asset",     shipped: true, label: "Asset Details",      icon: Laptop,  phase: "P8", disabled: !assetApplicable },
              // BOM chip is add-mode only. Edit-mode uses the dedicated
              // /items/[id]/bom editor because live BOMs need version workflow.
              ...(isEdit ? [] : [{ key: "bom" as const, shipped: true as const, label: "Assembly / BOM", icon: Layers, phase: "B1", disabled: !bomApplicable }]),
            ] as { key: SectionKey; shipped: true; label: string; icon: React.ComponentType<{ className?: string }>; phase: string; disabled: boolean }[]).map(({ key, label, icon: Icon, disabled }) => {
              const open = openSections.has(key)
              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && toggleSection(key)}
                  title={
                    !disabled ? undefined
                      : key === "asset"
                        ? "Only meaningful for Asset items — switch item type to 'Asset' to enable."
                        : "Only meaningful for Raw electronics or Sub-assemblies"
                  }
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-all ${
                    disabled
                      ? "border-border/50 bg-background text-muted-foreground/60 opacity-60 cursor-not-allowed"
                      : open
                        ? "border-primary/60 bg-primary/10 text-primary shadow-3xs cursor-pointer"
                        : "border-border/70 bg-background text-foreground hover:bg-muted/40 cursor-pointer"
                  }`}
                >
                  {!disabled && (open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />)}
                  <Icon className="h-3 w-3" /> {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ─── Section: Stock Info (P2) ─── */}
        {openSections.has("stock") && (
          <Card className="border border-border shadow-sm">
            <CardHeader className="bg-muted/10 border-b border-border/60 py-4 px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Boxes className="h-4 w-4 text-primary" />
                  <div>
                    <CardTitle className="text-lg font-bold text-foreground">Stock Info</CardTitle>
                    <CardDescription>Reorder levels + lead time. All optional.</CardDescription>
                  </div>
                </div>
                <button type="button" onClick={() => toggleSection("stock")} className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                  Remove section
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Minimum stock (reorder point)</label>
                  <Input type="number" min={0} step="any" placeholder="e.g. 500" value={minStock} onChange={(e) => setMinStock(e.target.value)} className="h-9" />
                  <span className="text-[11px] text-muted-foreground">Low/Critical alerts fire below this.</span>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Reorder quantity (MOQ)</label>
                  <Input type="number" min={0} step="any" placeholder="e.g. 1000" value={reorderQty} onChange={(e) => setReorderQty(e.target.value)} className="h-9" />
                  <span className="text-[11px] text-muted-foreground">Typical purchase quantity when replenishing.</span>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Safety stock</label>
                  <Input type="number" min={0} step="any" placeholder="e.g. 100" value={safetyStock} onChange={(e) => setSafetyStock(e.target.value)} className="h-9" />
                  <span className="text-[11px] text-muted-foreground">Buffer against demand spikes / supplier delays.</span>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Lead time (days)</label>
                  <Input type="number" min={0} step={1} placeholder="e.g. 14" value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} className="h-9" />
                  <span className="text-[11px] text-muted-foreground">Days from PO to receiving.</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── Section: Manufacturer Info (P3) ─── */}
        {openSections.has("mfr") && (
          <Card className="border border-border shadow-sm">
            <CardHeader className="bg-muted/10 border-b border-border/60 py-4 px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Factory className="h-4 w-4 text-primary" />
                  <div>
                    <CardTitle className="text-lg font-bold text-foreground">Manufacturer Info</CardTitle>
                    <CardDescription>
                      Brand + manufacturer part number (MPN) per source. One brand can be marked default (used when a caller doesn't name a variant).
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={addMfr} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Add manufacturer
                  </Button>
                  <button type="button" onClick={() => toggleSection("mfr")} className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                    Remove section
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-3">
              {isEdit ? (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Existing brand rows shown for context. In edit mode, changes here are <b>not</b> saved yet — brand-variant add/remove/rename lives in a dedicated flow (F5.6). Use the details page's variants panel for now.
                  </span>
                </div>
              ) : (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Opening stock is not accepted here yet — the ledger's dual-column invariant is still one-way (F5.4 removes that). Add the item now, then use <b>Inventory → Stock In</b> to seed opening quantities once F5.4 ships.
                  </span>
                </div>
              )}

              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-sm text-left text-foreground">
                  <thead className="text-[10px] uppercase bg-muted/40 text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-4 py-3 font-bold w-2/5">Manufacturer / Brand</th>
                      <th className="px-4 py-3 font-bold w-2/5">Manufacturer Part No (MPN)</th>
                      <th className="px-4 py-3 font-bold text-center w-24">Default</th>
                      <th className="px-3 py-3 w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-background">
                    {mfrRows.map((r, i) => (
                      <tr key={i} className="hover:bg-muted/10">
                        <td className="px-4 py-2">
                          <Input
                            placeholder="e.g. MSI, Yageo, Vishay"
                            value={r.brand}
                            onChange={(e) => updateMfr(i, "brand", e.target.value)}
                            className="h-8 text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Input
                            placeholder="e.g. Prestige-14-A11SC, RC0603JR-0710KL"
                            value={r.partNo}
                            onChange={(e) => updateMfr(i, "partNo", e.target.value)}
                            className="h-8 text-sm font-mono"
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="radio"
                            name="mfr-default"
                            checked={r.isDefault}
                            onChange={() => updateMfr(i, "isDefault", true)}
                            className="h-4 w-4 cursor-pointer accent-primary"
                            aria-label="Set as default variant"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Button
                            type="button" size="icon" variant="ghost"
                            disabled={mfrRows.length === 1}
                            onClick={() => removeMfr(i)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Assets like <i>MSI Prestige 14</i> typically have one manufacturer; consumables with multiple approved brands can list several.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ─── Section: Assembly / BOM (F6.4 B1, add-mode only) ─── */}
        {!isEdit && openSections.has("bom") && bomApplicable && (
          <Card className="border border-border shadow-sm">
            <CardHeader className="bg-muted/10 border-b border-border/60 py-4 px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <div>
                    <CardTitle className="text-lg font-bold text-foreground">Assembly / BOM</CardTitle>
                    <CardDescription>
                      Optional. Any lines you add here seed a Draft BOM version — after creation we&apos;ll drop you on the BOM editor to Activate. You can also skip this and add lines later.
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={addBomLine} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Add line
                  </Button>
                  <button type="button" onClick={() => toggleSection("bom")} className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                    Remove section
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-3">
              <div className="border border-border rounded-lg overflow-visible">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 text-muted-foreground border-b border-border text-[10px] uppercase font-bold">
                    <tr>
                      <th className="px-2 py-2 min-w-[260px]">Name</th>
                      <th className="px-2 py-2 w-28">Code</th>
                      <th className="px-2 py-2 w-24">Type</th>
                      <th className="px-2 py-2 w-16 text-center">Qty</th>
                      <th className="px-2 py-2 w-40">Ref des</th>
                      <th className="px-2 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {bomLines.map((l) => {
                      const linked  = !!l.childItemId
                      const matches = bomOpenRow === l.key ? (bomMatches[l.key] ?? []) : []
                      return (
                        <tr key={l.key} className="hover:bg-muted/10">
                          <td className="px-2 py-1.5">
                            <div className="relative">
                              <Input
                                value={l.childName}
                                onChange={(e) => onBomNameChange(l.key, e.target.value)}
                                onFocus={() => { if (l.childName.trim() && !linked) setBomOpenRow(l.key) }}
                                onBlur={() => window.setTimeout(() => setBomOpenRow((r) => (r === l.key ? null : r)), 150)}
                                placeholder="Search catalog — type a code or name…"
                                className={`h-8 text-xs ${linked ? "pr-7" : ""}`}
                                autoComplete="off"
                              />
                              {linked && (
                                <Link2 className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-500" />
                              )}
                              {matches.length > 0 && (
                                <ul className="absolute left-0 top-[calc(100%+2px)] z-50 max-h-56 w-[min(360px,80vw)] overflow-y-auto rounded-lg border border-border bg-popover shadow-xl">
                                  {matches.map((r) => (
                                    <li key={r.id}>
                                      <button
                                        type="button"
                                        onMouseDown={(e) => { e.preventDefault(); pickBomChild(l.key, r) }}
                                        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-muted/60"
                                      >
                                        <span className="min-w-0">
                                          <span className="block truncate font-medium">{r.name}</span>
                                          <span className="block truncate text-[10px] text-muted-foreground">
                                            {r.code} · {r.itemType.replace("_", " ")}
                                          </span>
                                        </span>
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              {!linked && l.childName.trim() && (
                                <span className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-600">
                                  <AlertCircle className="h-3 w-3" /> Pick a match — BOM lines must reference an existing item
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <Input value={l.childCode} readOnly className="h-8 text-xs font-mono bg-muted/20" disabled={!linked} />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input value={linked ? l.childItemType.replace("_", " ") : ""} readOnly className="h-8 text-xs bg-muted/20" disabled={!linked} />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              value={l.qty}
                              onChange={(e) => patchBomLine(l.key, { qty: e.target.value })}
                              className="h-8 text-xs text-center font-mono"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input
                              value={l.refDes}
                              onChange={(e) => patchBomLine(l.key, { refDes: e.target.value })}
                              placeholder="R1, R2, C3…"
                              className="h-8 text-xs font-mono"
                            />
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => removeBomLine(l.key)}
                              aria-label="Remove line"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                    {bomLines.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                          No lines. Click <b>Add line</b> to start.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <p className="text-[10px] text-muted-foreground">
                <Link2 className="inline h-3 w-3 text-emerald-500" /> linked to a catalog item.
                Preferred brand, sequence and remarks aren&apos;t captured here — pick them up in the BOM editor after creation.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ─── Section: Board Info (P5) ─── */}
        {openSections.has("board") && boardApplicable && (
          <Card className="border border-border shadow-sm">
            <CardHeader className="bg-muted/10 border-b border-border/60 py-4 px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" />
                  <div>
                    <CardTitle className="text-lg font-bold text-foreground">Board Info</CardTitle>
                    <CardDescription>Solder type, footprint and standard package quantity — for parts that sit on a PCB.</CardDescription>
                  </div>
                </div>
                <button type="button" onClick={() => toggleSection("board")} className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                  Remove section
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Solder type</label>
                  <div className="flex items-center gap-2">
                    {(["SMD", "DIP"] as const).map((s) => {
                      const active = solderType === s
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSolderType(s)}
                          className={`inline-flex items-center rounded-lg border px-4 py-1.5 text-xs font-bold cursor-pointer transition-all ${
                            active ? "border-primary/60 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted/30"
                          }`}
                        >
                          {s}
                        </button>
                      )
                    })}
                  </div>
                  <span className="text-[11px] text-muted-foreground">SMD = surface-mount, DIP = through-hole.</span>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Footprint</label>
                  <Input
                    value={footprint}
                    onChange={(e) => setFootprint(e.target.value)}
                    placeholder={solderType === "SMD" ? "e.g. 0603, 0805, SOT-23, QFN-32" : "e.g. DIP-8, TO-92, TO-220"}
                    list="footprint-suggestions"
                    className="h-9 font-mono"
                  />
                  <datalist id="footprint-suggestions">
                    {(solderType === "SMD"
                      ? ["0603", "0805", "1206", "1210", "SOT-23", "SOT-89", "SOIC-8", "SOIC-16", "TSSOP-16", "QFN-32", "QFN-48", "BGA-64"]
                      : ["DIP-8", "DIP-14", "DIP-16", "DIP-20", "TO-92", "TO-220", "TO-247"]
                    ).map((f) => <option key={f} value={f} />)}
                  </datalist>
                  <span className="text-[11px] text-muted-foreground">Package/land pattern the part uses.</span>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SPQ (standard pack qty)</label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={spq}
                    onChange={(e) => setSpq(e.target.value)}
                    placeholder="e.g. 5000"
                    className="h-9 font-mono"
                  />
                  <span className="text-[11px] text-muted-foreground">Units per reel/tray shipped by the manufacturer.</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── Section: Packaging Info (P6) ─── */}
        {openSections.has("packaging") && (
          <Card className="border border-border shadow-sm">
            <CardHeader className="bg-muted/10 border-b border-border/60 py-4 px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  <div>
                    <CardTitle className="text-lg font-bold text-foreground">Packaging Info</CardTitle>
                    <CardDescription>
                      Physical dimensions, weights, and material — used for shipping, storage planning, and packaging-item catalogs.
                    </CardDescription>
                  </div>
                </div>
                <button type="button" onClick={() => toggleSection("packaging")} className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                  Remove section
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              {/* Dimensions */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Dimensions <span className="normal-case tracking-normal text-[10px] text-muted-foreground/80">(mm)</span></label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-muted-foreground">Length</span>
                    <Input type="number" min={0} step="any" value={pkgLen} onChange={(e) => setPkgLen(e.target.value)} placeholder="e.g. 350" className="h-9 font-mono" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-muted-foreground">Width</span>
                    <Input type="number" min={0} step="any" value={pkgWid} onChange={(e) => setPkgWid(e.target.value)} placeholder="e.g. 240" className="h-9 font-mono" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-muted-foreground">Height</span>
                    <Input type="number" min={0} step="any" value={pkgHei} onChange={(e) => setPkgHei(e.target.value)} placeholder="e.g. 18" className="h-9 font-mono" />
                  </div>
                </div>
              </div>

              {/* Weights */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Unit weight <span className="normal-case tracking-normal text-[10px] text-muted-foreground/80">(g)</span></label>
                  <Input type="number" min={0} step="any" value={pkgWeight} onChange={(e) => setPkgWeight(e.target.value)} placeholder="e.g. 1400" className="h-9 font-mono" />
                  <span className="text-[11px] text-muted-foreground">Gross weight per unit — used for shipping estimates.</span>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tare weight <span className="normal-case tracking-normal text-[10px] text-muted-foreground/80">(g)</span></label>
                  <Input type="number" min={0} step="any" value={tareWeight} onChange={(e) => setTareWeight(e.target.value)} placeholder="e.g. 120" className="h-9 font-mono" />
                  <span className="text-[11px] text-muted-foreground">Empty-package weight — subtract from gross to get net.</span>
                </div>
              </div>

              {/* Material + reusable */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Material</label>
                  <Input
                    value={pkgMaterial}
                    onChange={(e) => setPkgMaterial(e.target.value)}
                    list="package-material-suggestions"
                    placeholder="e.g. Cardboard, HDPE, Bubble Wrap"
                    className="h-9"
                  />
                  <datalist id="package-material-suggestions">
                    {["Cardboard", "Corrugated Cardboard", "HDPE", "LDPE", "PP", "Bubble Wrap", "Foam", "ESD Foam", "Anti-static Bag", "Wood Crate", "Metal Case"].map((m) => <option key={m} value={m} />)}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Reusable</label>
                  <div className="flex items-center gap-2 h-9">
                    {([
                      { value: true,  label: "Yes" },
                      { value: false, label: "No" },
                      { value: null,  label: "—" },
                    ] as { value: boolean | null; label: string }[]).map(({ value, label }) => {
                      const active = pkgReusable === value
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setPkgReusable(value)}
                          className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-bold cursor-pointer transition-all ${
                            active ? "border-primary/60 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted/30"
                          }`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  <span className="text-[11px] text-muted-foreground">Reusable packages skip re-order calc when they cycle back.</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── Section: Storage / MSL (P7) ─── */}
        {openSections.has("storage") && (
          <Card className="border border-border shadow-sm">
            <CardHeader className="bg-muted/10 border-b border-border/60 py-4 px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-primary" />
                  <div>
                    <CardTitle className="text-lg font-bold text-foreground">Storage / MSL</CardTitle>
                    <CardDescription>
                      Temperature / humidity limits, moisture sensitivity level, hazardous flag, expiry tracking.
                    </CardDescription>
                  </div>
                </div>
                <button type="button" onClick={() => toggleSection("storage")} className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                  Remove section
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              {/* Temperature */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                  Storage temperature <span className="normal-case tracking-normal text-[10px] text-muted-foreground/80">(°C)</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-muted-foreground">Min</span>
                    <Input type="number" step="any" value={tempMin} onChange={(e) => setTempMin(e.target.value)} placeholder="e.g. 5" className="h-9 font-mono" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-muted-foreground">Max</span>
                    <Input type="number" step="any" value={tempMax} onChange={(e) => setTempMax(e.target.value)} placeholder="e.g. 40" className="h-9 font-mono" />
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground">Leave one side blank for a single-sided limit ("below 40°C").</span>
              </div>

              {/* Humidity */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">
                  Storage humidity <span className="normal-case tracking-normal text-[10px] text-muted-foreground/80">(% RH)</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-muted-foreground">Min</span>
                    <Input type="number" step="any" min={0} max={100} value={rhMin} onChange={(e) => setRhMin(e.target.value)} placeholder="e.g. 30" className="h-9 font-mono" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-muted-foreground">Max</span>
                    <Input type="number" step="any" min={0} max={100} value={rhMax} onChange={(e) => setRhMax(e.target.value)} placeholder="e.g. 60" className="h-9 font-mono" />
                  </div>
                </div>
              </div>

              {/* MSL + flags */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">MSL level <span className="normal-case tracking-normal text-[10px] text-muted-foreground/80">(J-STD-020)</span></label>
                  <select
                    value={msl}
                    onChange={(e) => setMsl((e.target.value as MslLevel) || "")}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">— Not specified —</option>
                    <option value="1">MSL 1 — Unlimited</option>
                    <option value="2">MSL 2 — 1 year</option>
                    <option value="2a">MSL 2a — 4 weeks</option>
                    <option value="3">MSL 3 — 168 h</option>
                    <option value="4">MSL 4 — 72 h</option>
                    <option value="5">MSL 5 — 48 h</option>
                    <option value="5a">MSL 5a — 24 h</option>
                    <option value="6">MSL 6 — Bake before use</option>
                  </select>
                  <span className="text-[11px] text-muted-foreground">Floor life after opening the dry pack.</span>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Hazardous</label>
                  <div className="flex items-center gap-2 h-9">
                    <button
                      type="button"
                      onClick={() => setHazardous((v) => !v)}
                      className={`inline-flex items-center rounded-lg border px-4 py-1.5 text-xs font-bold cursor-pointer transition-all ${
                        hazardous ? "border-destructive/60 bg-destructive/10 text-destructive" : "border-border bg-background text-muted-foreground hover:bg-muted/30"
                      }`}
                    >
                      {hazardous ? "Yes — hazardous" : "No"}
                    </button>
                  </div>
                  <span className="text-[11px] text-muted-foreground">Flag for downstream shipping / SDS handling.</span>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Expiry-tracked</label>
                  <div className="flex items-center gap-2 h-9">
                    <button
                      type="button"
                      onClick={() => setExpiryTracked((v) => !v)}
                      className={`inline-flex items-center rounded-lg border px-4 py-1.5 text-xs font-bold cursor-pointer transition-all ${
                        expiryTracked ? "border-primary/60 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted/30"
                      }`}
                    >
                      {expiryTracked ? "Yes — capture expiry on receive" : "No"}
                    </button>
                  </div>
                  <span className="text-[11px] text-muted-foreground">Goods-in will require a lot expiry when this is on.</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── Section: Asset Details (P8) ─── */}
        {openSections.has("asset") && assetApplicable && (
          <Card className="border border-border shadow-sm">
            <CardHeader className="bg-muted/10 border-b border-border/60 py-4 px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Laptop className="h-4 w-4 text-primary" />
                  <div>
                    <CardTitle className="text-lg font-bold text-foreground">Asset Details</CardTitle>
                    <CardDescription>
                      Custodian, serial number, purchase / warranty, depreciation basis, and current condition.
                    </CardDescription>
                  </div>
                </div>
                <button type="button" onClick={() => toggleSection("asset")} className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                  Remove section
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              {/* Custodian + Serial */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Custodian</label>
                  <select
                    value={custodianUserId}
                    onChange={(e) => setCustodianUserId(e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">— Unassigned —</option>
                    {tenantUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · {u.email}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-muted-foreground">
                    {tenantUsersLoaded ? "Person responsible for the asset." : "Loading users…"}
                  </span>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Serial number</label>
                  <Input
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    placeholder="e.g. MSI-14-2026-0142"
                    className="h-9 font-mono"
                  />
                  <span className="text-[11px] text-muted-foreground">Tenant-unique when set — duplicates are rejected.</span>
                </div>
              </div>

              {/* Purchase + Warranty */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Purchase date</label>
                  <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Purchase cost <span className="normal-case tracking-normal text-[10px] text-muted-foreground/80">(₹)</span></label>
                  <Input type="number" min={0} step="0.01" value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} placeholder="e.g. 105000.00" className="h-9 font-mono" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Warranty (months)</label>
                  <Input type="number" min={0} step={1} value={warrantyMonths} onChange={(e) => setWarrantyMonths(e.target.value)} placeholder="e.g. 36" className="h-9 font-mono" />
                </div>
              </div>

              {/* Depreciation */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Useful life (months)</label>
                  <Input type="number" min={1} step={1} value={usefulLifeMonths} onChange={(e) => setUsefulLifeMonths(e.target.value)} placeholder="e.g. 60" className="h-9 font-mono" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Salvage value <span className="normal-case tracking-normal text-[10px] text-muted-foreground/80">(₹)</span></label>
                  <Input type="number" min={0} step="0.01" value={salvageValue} onChange={(e) => setSalvageValue(e.target.value)} placeholder="e.g. 5000.00" className="h-9 font-mono" />
                  <span className="text-[11px] text-muted-foreground">Must be ≤ purchase cost.</span>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Depreciation method</label>
                  <select
                    value={depreciationMethod}
                    onChange={(e) => setDepreciationMethod((e.target.value as ItemDepreciationKind) || "")}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">— Not specified —</option>
                    <option value="none">None (non-depreciable)</option>
                    <option value="straight_line">Straight-line</option>
                    <option value="reducing_balance">Reducing balance</option>
                  </select>
                </div>
              </div>

              {/* Condition */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Current condition</label>
                <div className="flex flex-wrap items-center gap-2">
                  {([
                    { value: "new",     label: "New",     tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
                    { value: "good",    label: "Good",    tone: "border-primary/40 bg-primary/10 text-primary" },
                    { value: "fair",    label: "Fair",    tone: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
                    { value: "poor",    label: "Poor",    tone: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400" },
                    { value: "retired", label: "Retired", tone: "border-destructive/40 bg-destructive/10 text-destructive" },
                  ] as { value: ItemCondition; label: string; tone: string }[]).map(({ value, label, tone }) => {
                    const active = conditionKind === value
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setConditionKind(active ? "" : value)}
                        className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-bold cursor-pointer transition-all ${
                          active ? tone : "border-border bg-background text-muted-foreground hover:bg-muted/30"
                        }`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ─── Section: Specifications (P2) ─── */}
        {openSections.has("specs") && (
          <Card className="border border-border shadow-sm">
            <CardHeader className="bg-muted/10 border-b border-border/60 py-4 px-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-primary" />
                  <div>
                    <CardTitle className="text-lg font-bold text-foreground">Specifications</CardTitle>
                    <CardDescription>Free-form key/value attributes shown on the details page.</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={addSpec} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Add row
                  </Button>
                  <button type="button" onClick={() => toggleSection("specs")} className="text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                    Remove section
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-2">
              {specs.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input placeholder="Key (e.g. Voltage)"   value={s.key}   onChange={(e) => updateSpec(i, "key", e.target.value)}   className="h-9 flex-1" />
                  <Input placeholder="Value (e.g. 3.3 V)"   value={s.value} onChange={(e) => updateSpec(i, "value", e.target.value)} className="h-9 flex-1" />
                  <Button type="button" size="icon" variant="ghost" onClick={() => removeSpec(i)} className="h-9 w-9 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {specs.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-2">No specs yet — click "Add row" to add one.</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2">
          <Link
            href={isEdit && initial ? `/items/details/${initial.id}` : "/items/list"}
            aria-disabled={submitting || savingDraft}
            className={`inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted/30 ${submitting || savingDraft ? "pointer-events-none opacity-60" : ""}`}
          >
            Cancel
          </Link>
          <Button
            type="button"
            variant="outline"
            disabled={submitting || savingDraft}
            onClick={(e) => void submit(e as unknown as React.FormEvent, { asDraft: true })}
            className="gap-1.5"
            title={isEdit ? "Save changes and mark the item inactive" : "Save as inactive — you can activate it later from the item's edit page"}
          >
            {savingDraft ? "Saving draft…" : isEdit ? "Save as inactive" : "Save as draft"}
          </Button>
          <Button type="submit" disabled={submitting || savingDraft} className="gap-1.5">
            <Save className="h-4 w-4" />
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Save item"}
          </Button>
        </div>
      </form>
        </div>

        {/* Sticky preview panel (P9) — hidden on smaller screens where the
            form would already fill the viewport. */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 space-y-3">
            <div className="rounded-xl border border-border bg-card shadow-sm p-4 space-y-3">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <Eye className="h-3.5 w-3.5" /> Live preview
              </div>
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <typeMeta.icon className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-foreground truncate">
                      {name.trim() || <span className="text-muted-foreground italic">Item name</span>}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono truncate">
                      {code.trim() || "—"}{genericPn.trim() ? ` · ${genericPn}` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold border ${typeMeta.tone}`}>
                    <typeMeta.icon className="h-2.5 w-2.5" />
                    {typeMeta.label}
                  </span>
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold border border-border bg-muted/30 text-muted-foreground">
                    {sourceKind === "manufactured" ? "Made" : "Purchased"}
                  </span>
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold border border-border bg-muted/30 text-muted-foreground">
                    {baseUom}
                  </span>
                </div>
                {(categoryId && d.getCategory(categoryId)?.path) && (
                  <div className="text-[11px] text-muted-foreground truncate">
                    <span className="font-semibold">Category:</span> {d.getCategory(categoryId)?.path}
                  </div>
                )}
                {description.trim() && (
                  <p className="text-[11px] text-muted-foreground line-clamp-3">{description}</p>
                )}
              </div>

              {/* Enabled section badges */}
              <div className="pt-1 border-t border-border">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Sections filled</div>
                {openSections.size === 0 ? (
                  <p className="text-[11px] text-muted-foreground italic">Identity only — save to create.</p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {Array.from(openSections).map((s) => (
                      <span key={s} className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Key details snapshot — only what's set */}
              {(openSections.has("stock") && (minStock || reorderQty || leadTimeDays)) && (
                <div className="pt-1 border-t border-border text-[11px] text-muted-foreground space-y-0.5">
                  {minStock     && <div><span className="font-semibold text-foreground">Min:</span> {minStock}</div>}
                  {reorderQty   && <div><span className="font-semibold text-foreground">Reorder:</span> {reorderQty}</div>}
                  {leadTimeDays && <div><span className="font-semibold text-foreground">Lead time:</span> {leadTimeDays} d</div>}
                </div>
              )}
              {(openSections.has("mfr") && mfrRows.filter((r) => r.brand.trim()).length > 0) && (
                <div className="pt-1 border-t border-border">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Manufacturers</div>
                  <div className="space-y-0.5 max-h-24 overflow-y-auto">
                    {mfrRows.filter((r) => r.brand.trim()).map((r, i) => (
                      <div key={i} className="text-[11px] text-muted-foreground">
                        <span className="font-semibold text-foreground">{r.brand}</span>
                        {r.partNo && <span className="font-mono"> · {r.partNo}</span>}
                        {r.isDefault && <span className="text-primary"> ★</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(openSections.has("board") && (footprint || spq)) && (
                <div className="pt-1 border-t border-border text-[11px] text-muted-foreground space-y-0.5">
                  <div><span className="font-semibold text-foreground">{solderType}</span>{footprint ? ` · ${footprint}` : ""}{spq ? ` · SPQ ${spq}` : ""}</div>
                </div>
              )}
              {(openSections.has("asset") && (serialNumber || purchaseCost || conditionKind)) && (
                <div className="pt-1 border-t border-border text-[11px] text-muted-foreground space-y-0.5">
                  {serialNumber && <div className="font-mono truncate">S/N {serialNumber}</div>}
                  {purchaseCost && <div>₹ {purchaseCost}</div>}
                  {conditionKind && <div>Condition: <span className="font-semibold text-foreground">{conditionKind}</span></div>}
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground text-center italic">Preview updates as you type.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
