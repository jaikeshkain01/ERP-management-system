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
import { useRouter, useSearchParams } from "next/navigation"
import { withFromParam } from "@/lib/modules"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ArrowLeft, Save, AlertCircle, CheckCircle2, Info,
  Nut, Cpu, Package, Boxes, Wrench, Laptop, Factory, ShoppingBag,
  Lock, Plus, Trash2, ChevronDown, ChevronRight, Sliders,
  Copy, Search, Eye, Layers,
} from "lucide-react"
import { useData } from "@/lib/data-provider"
import { CategoryCascade } from "@/components/category-cascade"
import { extractError } from "@/lib/api-error"
import {
  readStagedBom, clearStagedBom,
  readItemFormDraft, writeItemFormDraft, clearItemFormDraft,
  type StagedBom, type StagedBomRow,
} from "@/lib/item-form-draft"

type ItemType = "raw" | "sub_assembly" | "finished_product" | "consumable" | "asset" | "packaging"
type ItemStatus = "active" | "inactive" | "discontinued"
type ItemStage = "under_production" | "production_complete" | "untested" | "testing" | "tested" | "faulty" | "finished"

function sourceKindFor(t: ItemType): "purchased" | "manufactured" {
  return t === "sub_assembly" || t === "finished_product" ? "manufactured" : "purchased"
}
function defaultStageFor(t: ItemType): ItemStage {
  return t === "sub_assembly" || t === "finished_product" ? "under_production" : "untested"
}

const STAGE_LABELS: Record<ItemStage, string> = {
  under_production: "Under Production",
  production_complete: "Production Complete",
  untested: "Untested",
  testing: "Testing",
  tested: "Tested",
  faulty: "Faulty",
  finished: "Finished",
}

interface ItemTypeMeta {
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
const ITEM_TYPES: ItemTypeMeta[] = [
  { value: "raw",            label: "Raw",              hint: "Purchased material or part",             slug: "RAW", defaultUom: "PCS", defaultSource: "purchased",    icon: Nut,     tone: "border-primary/30 bg-primary/5",         group: "build" },
  { value: "sub_assembly", label: "Sub-Assemblies",   hint: "A sub-assembly built in-house",          slug: "SUB", defaultUom: "PCS", defaultSource: "manufactured", icon: Cpu,     tone: "border-sky-500/30 bg-sky-500/5",         group: "build" },
  { value: "finished_product",      label: "Finished Products", hint: "A fully-built board or product",        slug: "FG",  defaultUom: "PCS", defaultSource: "manufactured", icon: Package, tone: "border-emerald-500/30 bg-emerald-500/5", group: "build" },
  { value: "consumable",     label: "Consumable",       hint: "Solder, flux, cleaner, adhesive, tape…", slug: "CON", defaultUom: "PCS", defaultSource: "purchased",    icon: Boxes,   tone: "border-amber-500/30 bg-amber-500/5",     group: "other" },
  { value: "asset",          label: "Asset",            hint: "IT gear, tools, machines, fixtures",     slug: "AST", defaultUom: "PCS", defaultSource: "purchased",    icon: Laptop,  tone: "border-violet-500/30 bg-violet-500/5",   group: "other" },
  { value: "packaging",      label: "Packaging",        hint: "Boxes, bags, foam, labels",              slug: "PKG", defaultUom: "PCS", defaultSource: "purchased",    icon: Wrench,  tone: "border-slate-500/30 bg-slate-500/5",     group: "other" },
]
const ITEM_TYPE_BY_VALUE: Record<ItemType, ItemTypeMeta> = Object.fromEntries(ITEM_TYPES.map((t) => [t.value, t])) as Record<ItemType, ItemTypeMeta>

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
  /** Slice 3: sellable flag. Independent of item type. */
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
  variants: { id: string; sourceKind: "purchased" | "manufactured"; brandId: string | null; brandSlug: string | null; partNo: string | null; isDefault: boolean }[];
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
 *  "bom" is add-mode only — the section now hosts Create-BOM / Import-BOM
 *  buttons that hand off to the dedicated /items/[id]/bom editor. */
type SectionKey = "stock" | "specs" | "mfr" | "board" | "packaging" | "storage" | "asset" | "bom"

export default function UniversalItemForm({ mode, initial }: UniversalItemFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const bomImported = searchParams.get("bomImported") === "1"
  const d = useData()
  const isEdit = mode === "edit"
  const fromId = searchParams.get("from")

  // `?type=X` on /items/add pre-selects the item type — driven by the
  // "Add item" buttons on the filtered Semi-assembled / Assembled Products
  // list pages so the user doesn't have to change item type after landing here.
  // Ignored in edit mode (initial always wins) and when the value isn't a
  // recognized ItemType.
  const validTypes = new Set<ItemType>(["raw", "sub_assembly", "finished_product", "consumable", "asset", "packaging"])
  const typeFromQuery = !isEdit ? searchParams?.get("type") ?? null : null
  const initialTypeFromQuery: ItemType | null =
    typeFromQuery && validTypes.has(typeFromQuery as ItemType) ? (typeFromQuery as ItemType) : null

  // Staged BOM (add-mode only). Populated when the user came back from
  // /items/import?returnTo=add — the importer serialised the reviewed rows
  // into sessionStorage instead of POSTing them. The BOM commits alongside
  // the item on save; discarding it here just clears the sessionStorage key.
  const [stagedBom, setStagedBom] = React.useState<StagedBom | null>(null)

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
  const [itemType, setItemType] = React.useState<ItemType>(initial?.itemType ?? initialTypeFromQuery ?? "raw")
  // Mark touched when the caller pre-selected via ?type=, so the category-→-
  // type auto-detect doesn't clobber it on first render.
  const [typeTouched, setTypeTouched] = React.useState(isEdit || initialTypeFromQuery !== null)
  // Source kind is derived from item type — no longer user-selectable.
  const sourceKind = sourceKindFor(itemType)
  const [categoryId, setCategoryId] = React.useState(initial?.categoryId ?? "")
  const [name, setName] = React.useState(initial?.name ?? "")
  const [code, setCode] = React.useState(initial?.code ?? "")
  const [codeTouched, setCodeTouched] = React.useState(isEdit)
  const [genericPn, setGenericPn] = React.useState(initial?.genericPn ?? "")
  const [description, setDescription] = React.useState(initial?.description ?? "")
  const [baseUom, setBaseUom] = React.useState(initial?.baseUom ?? "PCS")
  // Slice 3: sellable flag. Independent of item type — a sub-assembly can be
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
  // Sections can be open+expanded, open+collapsed (body hidden but still in the
  // submit payload), or closed. `collapsedSections` is the "peek/hide" set;
  // `openSections` is authoritative for submission. Chip-strip click flow:
  //   closed         → open + expanded + scroll into view
  //   open+expanded  → scroll into view (already visible)
  //   open+collapsed → uncollapse + scroll into view
  const [collapsedSections, setCollapsedSections] = React.useState<Set<SectionKey>>(new Set())
  const sectionRefs = React.useRef<Partial<Record<SectionKey, HTMLDivElement | null>>>({})
  const setSectionRef = React.useCallback((k: SectionKey) => (el: HTMLDivElement | null) => {
    sectionRefs.current[k] = el
  }, [])
  const scrollToSection = (k: SectionKey) => {
    const el = sectionRefs.current[k]
    if (!el) return
    window.setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 30)
  }
  const toggleSection = (k: SectionKey) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      if (next.has(k)) {
        // Chip click while open → scroll to it. If it was collapsed, uncollapse
        // as well; if the user actually wants to close a section they use the
        // section's own "Close" button, not the chip.
        setCollapsedSections((c) => { const n = new Set(c); n.delete(k); return n })
        scrollToSection(k)
        return prev
      }
      next.add(k)
      setCollapsedSections((c) => { const n = new Set(c); n.delete(k); return n })
      scrollToSection(k)
      return next
    })
  }
  const closeSection = (k: SectionKey) => {
    setOpenSections((prev) => { const n = new Set(prev); n.delete(k); return n })
    setCollapsedSections((c) => { const n = new Set(c); n.delete(k); return n })
  }
  const toggleCollapse = (k: SectionKey) => {
    setCollapsedSections((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
  }

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
  const boardApplicable = itemType === "raw" || itemType === "sub_assembly"
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
  // `id` is the server variant id when the row is loaded from `initial`;
  // empty string on new rows the user just added (they land as POSTs on
  // submit). The diff on submit uses id to route each row to PATCH / DELETE
  // / POST — see the F5.6 chain below the mfr POSTs block.
  interface MfrRow { id: string; brand: string; partNo: string; isDefault: boolean }
  const [mfrRows, setMfrRows] = React.useState<MfrRow[]>(() => {
    const seeded = (initial?.variants ?? [])
      .filter((v) => v.sourceKind === "purchased")
      .map((v) => ({ id: v.id, brand: v.brandSlug ?? "", partNo: v.partNo ?? "", isDefault: v.isDefault }))
    return seeded.length > 0 ? seeded : [{ id: "", brand: "", partNo: "", isDefault: true }]
  })
  const addMfr    = () => setMfrRows([...mfrRows, { id: "", brand: "", partNo: "", isDefault: false }])
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

  // ── Section: Assembly / BOM (add-mode only) ──
  //  The section renders two entry points (Create BOM / Import BOM) that
  //  save the item first, then hand off to the /items/[id]/bom editor.
  //  Inline row-by-row entry was retired — see the JSX below.
  const bomApplicable = itemType !== "raw"

  // Auto-close the section if the item type flips to raw (nothing there is valid).
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

  // Switching item type toggles the default source, UOM, and clears the
  // category if it no longer belongs to the new item type.
  const handlePickType = (t: ItemType) => {
    const meta = ITEM_TYPE_BY_VALUE[t]
    setItemType(t)
    setTypeTouched(true)
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

  // ── snapshot / hydrate for the pre-save BOM staging flow ─────────────
  // Build a plain object from every user-editable form field. Used when
  // the user clicks "Import BOM": we save the snapshot to sessionStorage
  // and jump to /items/import, then load it back on this component's next
  // mount so nothing they typed is lost.
  const snapshotForm = React.useCallback(() => ({
    itemType, categoryId, name, code, codeTouched,
    genericPn, description, baseUom, isFinishedGood,
    openSections: Array.from(openSections),
    collapsedSections: Array.from(collapsedSections),
    minStock, reorderQty, safetyStock, leadTimeDays,
    solderType, footprint, spq,
    pkgLen, pkgWid, pkgHei, pkgWeight, tareWeight, pkgMaterial, pkgReusable,
    tempMin, tempMax, rhMin, rhMax, msl, hazardous, expiryTracked,
    custodianUserId, serialNumber, purchaseDate, purchaseCost, warrantyMonths,
    usefulLifeMonths, salvageValue, depreciationMethod, conditionKind,
    specs, mfrRows,
  }), [
    itemType, categoryId, name, code, codeTouched,
    genericPn, description, baseUom, isFinishedGood,
    openSections, collapsedSections,
    minStock, reorderQty, safetyStock, leadTimeDays,
    solderType, footprint, spq,
    pkgLen, pkgWid, pkgHei, pkgWeight, tareWeight, pkgMaterial, pkgReusable,
    tempMin, tempMax, rhMin, rhMax, msl, hazardous, expiryTracked,
    custodianUserId, serialNumber, purchaseDate, purchaseCost, warrantyMonths,
    usefulLifeMonths, salvageValue, depreciationMethod, conditionKind,
    specs, mfrRows,
  ])

  // Mount-time hydration. Only in add mode: pull a form-state snapshot and
  // any staged BOM the importer wrote, apply them once, then quietly clear
  // the form draft (staged BOM stays until commit or explicit discard).
  const hydratedRef = React.useRef(false)
  React.useEffect(() => {
    if (isEdit || hydratedRef.current) return
    hydratedRef.current = true
    const bom = readStagedBom()
    if (bom) {
      setStagedBom(bom)
      // Auto-open the Assembly/BOM chip so the preview panel is visible
      // without an extra click — otherwise the freshly-staged BOM hides
      // behind the collapsible section header.
      setOpenSections((prev) => { const n = new Set(prev); n.add("bom"); return n })
    }
    const draft = readItemFormDraft()
    if (draft?.data && typeof draft.data === "object") {
      type Snap = ReturnType<typeof snapshotForm>
      const s = draft.data as Partial<Snap>
      if (s.itemType) { setItemType(s.itemType); setTypeTouched(true) }
      // sourceKind is now derived from itemType — no need to restore it
      if (typeof s.categoryId === "string") setCategoryId(s.categoryId)
      if (typeof s.name === "string") setName(s.name)
      if (typeof s.code === "string") { setCode(s.code); if (s.codeTouched) setCodeTouched(true) }
      if (typeof s.genericPn === "string") setGenericPn(s.genericPn)
      if (typeof s.description === "string") setDescription(s.description)
      if (typeof s.baseUom === "string") setBaseUom(s.baseUom)
      if (typeof s.isFinishedGood === "boolean") setIsFinishedGood(s.isFinishedGood)
      if (Array.isArray(s.openSections)) setOpenSections(new Set(s.openSections as SectionKey[]))
      if (Array.isArray(s.collapsedSections)) setCollapsedSections(new Set(s.collapsedSections as SectionKey[]))
      if (typeof s.minStock === "string") setMinStock(s.minStock)
      if (typeof s.reorderQty === "string") setReorderQty(s.reorderQty)
      if (typeof s.safetyStock === "string") setSafetyStock(s.safetyStock)
      if (typeof s.leadTimeDays === "string") setLeadTimeDays(s.leadTimeDays)
      if (s.solderType === "SMD" || s.solderType === "DIP") setSolderType(s.solderType)
      if (typeof s.footprint === "string") setFootprint(s.footprint)
      if (typeof s.spq === "string") setSpq(s.spq)
      if (typeof s.pkgLen === "string") setPkgLen(s.pkgLen)
      if (typeof s.pkgWid === "string") setPkgWid(s.pkgWid)
      if (typeof s.pkgHei === "string") setPkgHei(s.pkgHei)
      if (typeof s.pkgWeight === "string") setPkgWeight(s.pkgWeight)
      if (typeof s.tareWeight === "string") setTareWeight(s.tareWeight)
      if (typeof s.pkgMaterial === "string") setPkgMaterial(s.pkgMaterial)
      if (s.pkgReusable === true || s.pkgReusable === false || s.pkgReusable === null) setPkgReusable(s.pkgReusable)
      if (typeof s.tempMin === "string") setTempMin(s.tempMin)
      if (typeof s.tempMax === "string") setTempMax(s.tempMax)
      if (typeof s.rhMin === "string") setRhMin(s.rhMin)
      if (typeof s.rhMax === "string") setRhMax(s.rhMax)
      if (typeof s.msl === "string") setMsl(s.msl as MslLevel | "")
      if (typeof s.hazardous === "boolean") setHazardous(s.hazardous)
      if (typeof s.expiryTracked === "boolean") setExpiryTracked(s.expiryTracked)
      if (typeof s.custodianUserId === "string") setCustodianUserId(s.custodianUserId)
      if (typeof s.serialNumber === "string") setSerialNumber(s.serialNumber)
      if (typeof s.purchaseDate === "string") setPurchaseDate(s.purchaseDate)
      if (typeof s.purchaseCost === "string") setPurchaseCost(s.purchaseCost)
      if (typeof s.warrantyMonths === "string") setWarrantyMonths(s.warrantyMonths)
      if (typeof s.usefulLifeMonths === "string") setUsefulLifeMonths(s.usefulLifeMonths)
      if (typeof s.salvageValue === "string") setSalvageValue(s.salvageValue)
      if (typeof s.depreciationMethod === "string") setDepreciationMethod(s.depreciationMethod as ItemDepreciationKind | "")
      if (typeof s.conditionKind === "string") setConditionKind(s.conditionKind as ItemCondition | "")
      if (Array.isArray(s.specs)) setSpecs(s.specs)
      if (Array.isArray(s.mfrRows)) setMfrRows(s.mfrRows)
      clearItemFormDraft()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit])

  const submit = async (
    e: React.FormEvent,
    options: { asDraft?: boolean; openBomEditor?: boolean } = {},
  ) => {
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
    const cleanedSpecs = specs.filter((s) => s.key.trim() !== "")
    const cleanedMfrs  = mfrRows.filter((r) => r.brand.trim() !== "")

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
          // sourceKind is derived from itemType server-side. Brand variants
          // are posted as a follow-up POST /api/items/[id]/variants.
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) return showToast({ ...extractError(body, isEdit ? "Failed to save item" : "Failed to create item"), type: "error" })
      const savedId = (body?.data?.id as string | undefined) ?? initial?.id

      // Variant chain.
      //   ADD mode  → POST /variants for every non-empty row.
      //   EDIT mode → diff mfrRows against initial.variants (F5.6):
      //     • rows whose id vanished from mfrRows           → DELETE /variants/[vId]
      //     • rows whose brand/partNo/default changed       → PATCH  /variants/[vId]
      //     • new rows (id === "" with a brand filled in)   → POST   /variants
      //   The order is DELETE → PATCH → POST so default-toggle propagation
      //   never fights a stale row (a deleted default has already handed off
      //   by the time a PATCH tries to flip a different sibling).
      const failed: string[] = []
      if (mfrOpen && savedId) {
        if (!isEdit) {
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
        } else {
          const originals = (initial?.variants ?? []).filter((v) => v.sourceKind === "purchased")
          const kept = new Set(mfrRows.map((r) => r.id).filter((id) => id))
          const removed = originals.filter((v) => !kept.has(v.id))
          for (const v of removed) {
            const dr = await fetch(`/api/items/${savedId}/variants/${v.id}`, { method: "DELETE" })
            if (!dr.ok) {
              const db = await dr.json().catch(() => null)
              failed.push(`Delete ${v.brandSlug ?? "variant"}: ${extractError(db, "failed").message}`)
            }
          }
          for (const r of mfrRows) {
            const brand = r.brand.trim()
            if (r.id) {
              const orig = originals.find((v) => v.id === r.id)
              if (!orig) continue
              const patch: { brand?: string; partNo?: string | null; isDefault?: boolean } = {}
              if (brand && brand !== (orig.brandSlug ?? "")) patch.brand = brand
              const nextPn = r.partNo.trim() || null
              if (nextPn !== (orig.partNo ?? null)) patch.partNo = nextPn
              if (r.isDefault && !orig.isDefault) patch.isDefault = true
              if (Object.keys(patch).length === 0) continue
              const pr = await fetch(`/api/items/${savedId}/variants/${r.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
              })
              if (!pr.ok) {
                const pb = await pr.json().catch(() => null)
                failed.push(`Update ${orig.brandSlug ?? brand}: ${extractError(pb, "failed").message}`)
              }
            } else if (brand) {
              const cr = await fetch(`/api/items/${savedId}/variants`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  brand,
                  partNo: r.partNo.trim() || null,
                  isDefault: r.isDefault,
                }),
              })
              if (!cr.ok) {
                const cb = await cr.json().catch(() => null)
                failed.push(`Add ${brand}: ${extractError(cb, "failed").message}`)
              }
            }
          }
        }
      }

      // ── Staged BOM commit (add-mode only, only when the importer left
      // rows in sessionStorage). Chunked so a wide BOM (~400 rows) still
      // reports progress and the UI doesn't block on one giant POST. The
      // first chunk creates the Draft; subsequent chunks append. Any
      // failure here is surfaced through the same `failed` list as the
      // MFR follow-up steps and does NOT roll back the item — the user
      // can retry the BOM from the item's edit page. ──
      if (!isEdit && savedId && stagedBom && stagedBom.rows.length > 0) {
        const IMPORT_CHUNK_SIZE = 250
        let draftCreated = false
        let lastBomVersionId: string | null = null
        try {
          for (let cursor = 0; cursor < stagedBom.rows.length; cursor += IMPORT_CHUNK_SIZE) {
            const chunk = stagedBom.rows.slice(cursor, cursor + IMPORT_CHUNK_SIZE).map((r: StagedBomRow) => ({
              name: r.name,
              partNo: r.partNo,
              manufacturer: r.manufacturer,
              supplier: r.supplier,
              designator: r.designator,
              solderType: r.solderType,
              footprint: r.footprint,
              qty: r.qty,
              categoryId: r.categoryId,
            }))
            const mode = draftCreated ? "append" : "create"
            const br = await fetch(`/api/items/${savedId}/bom-import`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                rows: chunk,
                mode,
                sourceLabel: `${stagedBom.fileName || "staged BOM"}${stagedBom.sheetSummary.length > 0 ? ` / ${stagedBom.sheetSummary.map((s) => s.sheetName).join(", ")}` : ""}`,
              }),
            })
            if (!br.ok) {
              const bb = await br.json().catch(() => null)
              failed.push(`BOM: ${extractError(bb, "failed").message}`)
              break
            }
            const bomBody = await br.json().catch(() => null)
            lastBomVersionId = bomBody?.data?.bomVersionId ?? lastBomVersionId
            draftCreated = true
          }
          // All chunks written: flip the Draft to Active so the item shows
          // with an Active BOM on the module lists straight away.
          if (draftCreated && lastBomVersionId) {
            try {
              await fetch(`/api/items/${savedId}/bom/${lastBomVersionId}/activate`, { method: "POST" })
            } catch { /* non-fatal — user can activate manually */ }
          }
          if (draftCreated) clearStagedBom()
        } catch (e) {
          failed.push(`BOM: ${e instanceof Error ? e.message : "network error"}`)
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
      // "Create BOM" sends the user straight to the BOM editor after the
      // item saves. Otherwise fall back to the usual details-in-list or
      // details page. The "Import BOM" path used to detour here before
      // committing; it now stages rows in sessionStorage and commits with
      // the item, so there's nothing extra to route to on that path.
      const target = options.openBomEditor && savedId
        ? `/items/${savedId}/bom`
        : isEdit && savedId
          ? withFromParam(`/items/details/${savedId}`, fromId)
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
    // sourceKind is derived from itemType — no setter needed
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

  // Section shell — one place that renders the header (icon + title + description
  // + optional headerExtras like "Add manufacturer"), the collapse chevron, the
  // Close button, and the conditionally-hidden body. Each section under the
  // "Add more info" strip funnels through this so scroll-target, collapse, and
  // close behavior stay identical across every kind of section.
  const renderSection = (opts: {
    sectionKey: SectionKey
    icon: React.ComponentType<{ className?: string }>
    title: string
    description: React.ReactNode
    headerExtras?: React.ReactNode
    children: React.ReactNode
  }) => {
    const { sectionKey, icon: Icon, title, description, headerExtras, children } = opts
    if (!openSections.has(sectionKey)) return null
    const collapsed = collapsedSections.has(sectionKey)
    return (
      <div ref={setSectionRef(sectionKey)} className="scroll-mt-40">
        <Card className="border border-border shadow-sm">
          <CardHeader className={`bg-muted/10 py-3.5 px-6 ${collapsed ? "" : "border-b border-border/60"}`}>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => toggleCollapse(sectionKey)}
                className="flex items-center gap-2 text-left min-w-0 group cursor-pointer"
                title={collapsed ? "Expand section" : "Collapse section"}
              >
                <Icon className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <CardTitle className="text-base font-bold text-foreground group-hover:text-primary transition-colors">{title}</CardTitle>
                  {!collapsed && (
                    <CardDescription className="text-xs">{description}</CardDescription>
                  )}
                </div>
                {collapsed
                  ? <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 ml-1" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-1" />}
              </button>
              <div className="flex items-center gap-2 shrink-0">
                {!collapsed && headerExtras}
                <button
                  type="button"
                  onClick={() => closeSection(sectionKey)}
                  className="text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded-md hover:bg-muted/40 transition-colors cursor-pointer"
                  title="Close this section (clears its data from the submit payload)"
                >
                  Close
                </button>
              </div>
            </div>
          </CardHeader>
          {!collapsed && <CardContent className="p-6">{children}</CardContent>}
        </Card>
      </div>
    )
  }

  return (
    <div className="pb-12">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 xl:gap-8">
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
                <Link href={withFromParam(`/items/details/${initial.id}`, fromId)} className="hover:text-foreground transition-colors truncate max-w-[240px]">{initial.name}</Link>
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
            href={isEdit && initial ? withFromParam(`/items/details/${initial.id}`, fromId) : "/items/list"}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold hover:bg-muted/30"
          >
            <ArrowLeft className="h-4 w-4" /> {isEdit ? "Back to details" : "Back to Items"}
          </Link>
        </div>
      </div>

      {/* BOM-imported banner. Set by the /items/import flow after it attaches
          a BOM to a freshly-saved parent — the query param bounces the user
          back here with everything they had already typed still on screen. */}
      {isEdit && bomImported && initial && (
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
          <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-emerald-500" />
          <div className="flex-1 min-w-0 text-sm">
            <div className="font-bold text-foreground">BOM imported</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Your item details are already saved. Open the BOM to review or edit the imported lines.
            </div>
          </div>
          <Link
            href={`/items/${initial.id}/bom`}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 text-white px-3 py-1.5 text-xs font-bold hover:bg-emerald-600"
          >
            <Layers className="h-3.5 w-3.5" /> Open BOM
          </Link>
        </div>
      )}

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
                  {ITEM_TYPE_BY_VALUE[t.itemType]?.label ?? t.itemType.replace("_", " ")}
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
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                Item Type
                {isEdit && <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground/80 normal-case tracking-normal"><Lock className="h-3 w-3" /> keep in mind: changing item type on an existing item reclassifies it everywhere</span>}
              </label>
              {(["build", "other"] as const).map((group) => {
                const types = ITEM_TYPES.filter((t) => t.group === group)
                return (
                  <div key={group} className="space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {group === "build" ? "Build" : "Other"}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {types.map((t) => {
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

            {/* Source + Default Stage — both derived from item type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Source</label>
                <div className="h-9 flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 text-sm">
                  {sourceKind === "purchased"
                    ? <><ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-semibold">Purchased</span></>
                    : <><Factory className="h-3.5 w-3.5 text-muted-foreground" /><span className="font-semibold">Made in-house</span></>}
                  <span className="text-[10px] text-muted-foreground/70 italic ml-auto"><Lock className="h-3 w-3 inline -mt-0.5 mr-0.5" />derived from item type</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Default Stage</label>
                <div className="h-9 flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 text-sm">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                    sourceKind === "manufactured"
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400"
                  }`}>
                    {STAGE_LABELS[defaultStageFor(itemType)]}
                  </span>
                  <span className="text-[10px] text-muted-foreground/70 italic ml-auto">new pieces start here</span>
                </div>
              </div>
            </div>

            {/* Finished-good flag (Slice 3). Independent of item type. */}
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
                    Independent of item type — a sub-assembly can also be a finished good. Feeds the sales module.
                  </div>
                </div>
              </label>
            </div>

            {/* Category — filtered to the chosen item type */}
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
              <CategoryCascade value={categoryId} onChange={setCategoryId} allLabel="— Select a category —" itemTypeFilter={itemType} />
              {showAddCat && (
                <div className="rounded-lg border border-border bg-muted/10 p-3 space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    New category will be added {categoryId
                      ? <>under <span className="font-mono text-foreground">{d.getCategory(categoryId)?.path}</span></>
                      : "as a top-level root"}, under item type <span className="font-mono text-foreground">{ITEM_TYPE_BY_VALUE[itemType].label}</span>.
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
                Categories are scoped to the item type picked above. Change the item type to see a different set.
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

        {/* Section-picker toolbar — sticky so add/remove/jump-to is always one
            click away as the form grows. Each tile shows three states:
              • closed        (add — subtle outline)
              • open+expanded (open — primary tint + green dot)
              • open+collapsed(open, body hidden — primary tint + amber dot)
            Click while open scrolls to that section (and un-collapses if needed).
            "Close" comes from each section's own header, not this toolbar. */}
        <div className="sticky top-14 z-20 -mx-2 sm:mx-0 px-2 sm:px-0">
          <Card className="border border-border shadow-sm bg-card/95 backdrop-blur-sm">
            <CardHeader className="border-b border-border/60 bg-muted/10 py-3 px-4 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <Info className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">Add more info</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Tap a tile to open a section, tap again to jump back to it. Fill only what applies —
                      unopened sections are treated as "not applicable".
                    </p>
                  </div>
                </div>
                {openSections.size > 0 && (
                  <span className="shrink-0 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                    {openSections.size} open
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2">
                {([
                  { key: "stock",     label: "Stock",        icon: Boxes,   disabled: false },
                  { key: "specs",     label: "Specs",        icon: Sliders, disabled: false },
                  { key: "mfr",       label: "Manufacturer", icon: Factory, disabled: false },
                  { key: "board",     label: "Board",        icon: Cpu,     disabled: !boardApplicable },
                  { key: "packaging", label: "Packaging",    icon: Package, disabled: false },
                  { key: "storage",   label: "Storage / MSL",icon: Wrench,  disabled: false },
                  { key: "asset",     label: "Asset",        icon: Laptop,  disabled: !assetApplicable },
                  // BOM tile is add-mode only. Edit-mode uses the dedicated
                  // /items/[id]/bom editor because live BOMs need version workflow.
                  ...(isEdit ? [] : [{ key: "bom" as const, label: "Assembly / BOM", icon: Layers, disabled: !bomApplicable }]),
                ] as { key: SectionKey; label: string; icon: React.ComponentType<{ className?: string }>; disabled: boolean }[]).map(({ key, label, icon: Icon, disabled }) => {
                  const open = openSections.has(key)
                  const collapsed = open && collapsedSections.has(key)
                  const tone =
                    disabled
                      ? "border-border/50 bg-muted/20 text-muted-foreground/60 cursor-not-allowed"
                      : open
                        ? "border-primary/50 bg-primary/5 text-primary hover:bg-primary/10 cursor-pointer"
                        : "border-border bg-background text-foreground hover:bg-muted/40 cursor-pointer"
                  const dotTone =
                    collapsed ? "bg-amber-500" : open ? "bg-emerald-500" : "bg-transparent"
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={disabled}
                      onClick={() => !disabled && toggleSection(key)}
                      title={
                        !disabled
                          ? open
                            ? collapsed ? `${label} — open (collapsed). Click to expand + scroll to it.` : `${label} — open. Click to scroll to it.`
                            : `${label} — click to open.`
                          : key === "asset"
                            ? "Only meaningful for Asset items — switch item type to 'Asset' to enable."
                            : "Only meaningful for Raw electronics or Sub-assemblies"
                      }
                      className={`group relative flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left transition-all ${tone}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotTone}`} />
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="text-[11px] font-semibold truncate">{label}</span>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── Section: Stock Info (P2) ─── */}
        {renderSection({
          sectionKey: "stock",
          icon: Boxes,
          title: "Stock Info",
          description: "Reorder levels + lead time. All optional.",
          children: (
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
          ),
        })}

        {/* ─── Section: Manufacturer Info (P3) ─── */}
        {renderSection({
          sectionKey: "mfr",
          icon: Factory,
          title: "Manufacturer Info",
          description: "Brand + manufacturer part number (MPN) per source. One brand can be marked default (used when a caller doesn't name a variant).",
          headerExtras: (
            <Button type="button" size="sm" variant="outline" onClick={addMfr} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add manufacturer
            </Button>
          ),
          children: (
            <div className="space-y-3">
              {!isEdit && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Opening stock isn&apos;t captured here — add the item first, then use <b>Inventory → Stock In</b> to seed quantities.
                  </span>
                </div>
              )}
              {isEdit && (
                <div className="rounded-md border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-[11px] text-sky-800 dark:text-sky-300 flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Add, edit or remove brand variants freely. Removals require zero on-hand and no open POs — the server refuses otherwise. Removing the current default auto-promotes the earliest surviving variant.
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
            </div>
          ),
        })}

        {/* ─── Section: Assembly / BOM (add-mode only) ─── */}
        {/* Inline BOM entry retired: the section now offers two entry points
            that both save the item first, then hand off to the dedicated BOM
            editor (Create BOM = empty draft, Import BOM = spreadsheet flow).
            Keeping lines inline forced users to context-switch between two
            editors for the same data. */}
        {!isEdit && bomApplicable && renderSection({
          sectionKey: "bom",
          icon: Layers,
          title: "Assembly / BOM",
          description: stagedBom
            ? `${stagedBom.rows.length} BOM line${stagedBom.rows.length === 1 ? "" : "s"} staged from ${stagedBom.fileName || "a spreadsheet"}. They'll commit alongside the item when you save.`
            : "Optional. Save the item, then either build the BOM by hand in the editor or import it from a spreadsheet.",
          children: stagedBom ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 font-bold">
                  <CheckCircle2 className="h-3 w-3" />
                  {stagedBom.rows.length} lines staged
                </span>
                {stagedBom.sheetSummary.map((s) => (
                  <span key={s.sheetName} className="rounded-full bg-muted/60 px-2 py-0.5 font-mono">
                    {s.sheetName} · {s.rowCount}
                  </span>
                ))}
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px] sticky top-0">
                      <tr>
                        {["Name", "Part No.", "Mfr", "Qty", "Ref"].map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-bold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {stagedBom.rows.slice(0, 100).map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 truncate max-w-[220px]">{r.name}</td>
                          <td className="px-3 py-1.5 font-mono truncate max-w-[140px]">{r.partNo ?? "—"}</td>
                          <td className="px-3 py-1.5 truncate max-w-[140px]">{r.manufacturer ?? "—"}</td>
                          <td className="px-3 py-1.5 font-mono">{r.qty}</td>
                          <td className="px-3 py-1.5 font-mono truncate max-w-[180px]">{r.designator ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {stagedBom.rows.length > 100 && (
                  <div className="border-t border-border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
                    Showing 100 of {stagedBom.rows.length} rows. All lines commit on save.
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={submitting || savingDraft}
                  onClick={() => {
                    writeItemFormDraft(snapshotForm())
                    router.push(`/items/import?returnTo=add&stage=${encodeURIComponent(itemType)}`)
                  }}
                >
                  <Layers className="h-3.5 w-3.5" /> Re-import BOM
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  disabled={submitting || savingDraft}
                  onClick={() => { clearStagedBom(); setStagedBom(null) }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Discard staged BOM
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-11 gap-2 font-semibold"
                disabled={submitting || savingDraft}
                onClick={(e) => void submit(e as unknown as React.FormEvent, { openBomEditor: true })}
              >
                <Plus className="h-4 w-4" />
                Create BOM
                <span className="text-[10px] font-medium text-muted-foreground/80">— saves &amp; opens the editor</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1 h-11 gap-2 font-semibold"
                disabled={submitting || savingDraft}
                onClick={() => {
                  // Snapshot the form so nothing the user typed is lost while
                  // they're on the import page, then hand off. No POST here —
                  // the BOM stages in sessionStorage and commits together with
                  // the item when the user saves this form.
                  writeItemFormDraft(snapshotForm())
                  router.push(`/items/import?returnTo=add&stage=${encodeURIComponent(itemType)}`)
                }}
              >
                <Layers className="h-4 w-4" />
                Import BOM
                <span className="text-[10px] font-medium text-muted-foreground/80">— stages rows in memory, commits with save</span>
              </Button>
            </div>
          ),
        })}

        {/* ─── Section: Board Info (P5) ─── */}
        {boardApplicable && renderSection({
          sectionKey: "board",
          icon: Cpu,
          title: "Board Info",
          description: "Solder type, footprint and standard package quantity — for parts that sit on a PCB.",
          children: (
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
          ),
        })}

        {/* ─── Section: Packaging Info (P6) ─── */}
        {renderSection({
          sectionKey: "packaging",
          icon: Package,
          title: "Packaging Info",
          description: "Physical dimensions, weights, and material — used for shipping, storage planning, and packaging-item catalogs.",
          children: (
            <div className="space-y-5">
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
            </div>
          ),
        })}

        {/* ─── Section: Storage / MSL (P7) ─── */}
        {renderSection({
          sectionKey: "storage",
          icon: Wrench,
          title: "Storage / MSL",
          description: "Temperature / humidity limits, moisture sensitivity level, hazardous flag, expiry tracking.",
          children: (
            <div className="space-y-5">
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
            </div>
          ),
        })}

        {/* ─── Section: Asset Details (P8) ─── */}
        {assetApplicable && renderSection({
          sectionKey: "asset",
          icon: Laptop,
          title: "Asset Details",
          description: "Custodian, serial number, purchase / warranty, depreciation basis, and current condition.",
          children: (
            <div className="space-y-5">
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
            </div>
          ),
        })}

        {/* ─── Section: Specifications (P2) ─── */}
        {renderSection({
          sectionKey: "specs",
          icon: Sliders,
          title: "Specifications",
          description: "Free-form key/value attributes shown on the details page.",
          headerExtras: (
            <Button type="button" size="sm" variant="outline" onClick={addSpec} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add row
            </Button>
          ),
          children: (
            <div className="space-y-2">
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
                <p className="text-xs text-muted-foreground italic py-2">No specs yet — click &quot;Add row&quot; to add one.</p>
              )}
            </div>
          ),
        })}

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2">
          <Link
            href={isEdit && initial ? withFromParam(`/items/details/${initial.id}`, fromId) : "/items/list"}
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
            {/* Suggested-sections card. Fills what would otherwise be empty
                whitespace on a fresh form with something actually useful:
                the sections most people fill in for THIS item type. Each
                row is a click-to-open shortcut — matches the sticky
                toolbar's behavior but is context-aware. */}
            {(() => {
              // Per-stage recommendation set. Order = suggested order of fill.
              // Keys align with SectionKey so the shortcut click just calls
              // toggleSection.
              type Suggestion = { key: SectionKey; label: string; icon: React.ComponentType<{ className?: string }>; why: string }
              const suggestionsByType: Record<ItemType, Suggestion[]> = {
                raw: [
                  { key: "mfr",       label: "Manufacturer Info", icon: Factory, why: "Every raw part needs its supplier + MPN." },
                  { key: "board",     label: "Board Info",        icon: Cpu,     why: "Solder type, footprint, SPQ." },
                  { key: "stock",     label: "Stock Info",        icon: Boxes,   why: "Reorder point + lead time = planner works." },
                  { key: "packaging", label: "Packaging",         icon: Package, why: "Only if size/weight matters for storage." },
                ],
                sub_assembly: [
                  { key: "bom",       label: "Assembly / BOM",    icon: Layers,  why: "What raws go into this sub-assembly." },
                  { key: "mfr",       label: "Manufacturer Info", icon: Factory, why: "Add here only if you also BUY it from a vendor." },
                  { key: "stock",     label: "Stock Info",        icon: Boxes,   why: "Reorder point + lead time." },
                  { key: "board",     label: "Board Info",        icon: Cpu,     why: "For populated PCBs — solder type, footprint." },
                ],
                finished_product: [
                  { key: "bom",       label: "Assembly / BOM",    icon: Layers,  why: "The full recipe of sub-assemblies + raws." },
                  { key: "packaging", label: "Packaging",         icon: Package, why: "Shipping dims + weight for finished goods." },
                  { key: "mfr",       label: "Manufacturer Info", icon: Factory, why: "Only if you also source it externally." },
                  { key: "stock",     label: "Stock Info",        icon: Boxes,   why: "Safety stock + reorder point." },
                ],
                consumable: [
                  { key: "stock",     label: "Stock Info",        icon: Boxes,   why: "Consumables burn — safety stock matters." },
                  { key: "storage",   label: "Storage / MSL",     icon: Wrench,  why: "Temp/humidity + expiry tracking." },
                  { key: "mfr",       label: "Manufacturer Info", icon: Factory, why: "Supplier + MPN." },
                  { key: "packaging", label: "Packaging",         icon: Package, why: "For bulky consumables." },
                ],
                asset: [
                  { key: "asset",     label: "Asset Details",     icon: Laptop,  why: "Custodian, serial, purchase + depreciation." },
                  { key: "mfr",       label: "Manufacturer Info", icon: Factory, why: "Vendor + MPN for warranty claims." },
                  { key: "storage",   label: "Storage / MSL",     icon: Wrench,  why: "Only if the asset has storage constraints." },
                ],
                packaging: [
                  { key: "packaging", label: "Packaging",         icon: Package, why: "Dimensions + weight of the pack itself." },
                  { key: "stock",     label: "Stock Info",        icon: Boxes,   why: "Reorder point for boxes/tape/etc." },
                  { key: "mfr",       label: "Manufacturer Info", icon: Factory, why: "Supplier + MPN." },
                ],
              }
              const suggestions = suggestionsByType[itemType] ?? []
              const totalSections = suggestions.length
              const openCount = suggestions.filter((s) => openSections.has(s.key)).length
              const pct = totalSections > 0 ? Math.round((openCount / totalSections) * 100) : 0
              return (
                <div className="rounded-xl border border-border bg-card shadow-sm p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <Info className="h-3.5 w-3.5 text-primary" /> Suggested for {typeMeta.label}
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">{openCount}/{totalSections}</span>
                  </div>
                  {totalSections > 0 && (
                    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  <ul className="space-y-1">
                    {suggestions.map((s) => {
                      const open = openSections.has(s.key)
                      const applicable =
                        s.key === "board" ? boardApplicable :
                        s.key === "asset" ? assetApplicable :
                        s.key === "bom"   ? bomApplicable && !isEdit :
                        true
                      const disabled = !applicable
                      return (
                        <li key={s.key}>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => !disabled && toggleSection(s.key)}
                            className={`w-full text-left flex items-start gap-2 rounded-md border px-2.5 py-2 text-[11px] transition-all ${
                              disabled
                                ? "border-border/40 bg-muted/10 text-muted-foreground/50 cursor-not-allowed"
                                : open
                                  ? "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 cursor-pointer"
                                  : "border-border bg-background hover:bg-muted/40 cursor-pointer"
                            }`}
                          >
                            <span className={`mt-0.5 h-1.5 w-1.5 rounded-full shrink-0 ${open ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
                            <s.icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${open ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} />
                            <div className="min-w-0 flex-1">
                              <div className={`font-semibold text-[11px] ${open ? "text-emerald-700 dark:text-emerald-300" : "text-foreground"}`}>
                                {s.label}
                                {open && <span className="ml-1 text-[9px] font-normal opacity-70">— open</span>}
                                {disabled && <span className="ml-1 text-[9px] font-normal opacity-70">— n/a for this type</span>}
                              </div>
                              <div className="text-[10px] text-muted-foreground leading-snug">{s.why}</div>
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  <p className="text-[10px] text-muted-foreground italic text-center pt-1 border-t border-border">
                    Optional — you can save with just Section 1.
                  </p>
                </div>
              )
            })()}

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
