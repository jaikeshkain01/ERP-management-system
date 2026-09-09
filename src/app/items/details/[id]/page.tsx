"use client"

/**
 * Universal Item Details (P13) — full-page detail surface for one item.
 *
 * Replaces the 1652-line legacy /components/details page as the promoted
 * view for a single item. Sections render only when the item actually has
 * data for them (a raw resistor won't show Asset Details; an IT laptop
 * won't show Board Info). Stock rollup calls the universal `/api/items/[id]/stock`
 * endpoint (F5.5) — works for every item type, including manufactured
 * products and PCB revisions now that F5.4 opened the ledger to them.
 */

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation"
import { backTargetForDetail, withFromParam } from "@/lib/modules"
import { ItemOpeningBalanceDialog } from "@/components/inventory/item-opening-balance-dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ArrowLeft, Nut, Cpu, Package, Boxes, Wrench, Laptop, Factory,
  Pencil, Trash2, AlertCircle, AlertTriangle, CheckCircle2, Info,
  ShoppingBag, Sliders, Layers, GitBranch, PackagePlus, History,
  ListTree, Table2, ChevronRight, ChevronDown, ArrowDown, Loader2, Hash,
  ArrowUpRight, ArrowDownLeft, ArrowLeftRight, User, FileText, StickyNote,
} from "lucide-react"
import { DragScrollArea } from "@/components/ui/drag-scroll-area"
import { extractError } from "@/lib/api-error"

// ── shapes (mirror src/lib/server/data/items.ts ItemView) ─────────────────
type ItemType = "raw" | "sub_assembly" | "finished_product" | "consumable" | "asset" | "packaging"
type ItemStatus = "active" | "inactive" | "discontinued"

interface Variant {
  id: string; itemId: string
  sourceKind: "purchased" | "manufactured"
  brandId: string | null; brandSlug: string | null
  partNo: string | null
  isDefault: boolean
  status: ItemStatus
}

interface Item {
  id: string; code: string; genericPn: string | null; name: string; description: string | null
  categoryId: string | null; categoryPath: string | null
  itemType: ItemType; baseUom: string
  minStock: number; reorderQty: number; safetyStock: number; leadTimeDays: number | null
  specs: unknown
  status: ItemStatus
  solderType: "SMD" | "DIP" | null; footprint: string | null; spq: number | null
  packageLengthMm: number | null; packageWidthMm: number | null; packageHeightMm: number | null
  packageWeightG: number | null; tareWeightG: number | null
  packageMaterial: string | null; packageReusable: boolean | null
  storageTempMinC: number | null; storageTempMaxC: number | null
  storageHumidityMinPct: number | null; storageHumidityMaxPct: number | null
  mslLevel: "1" | "2" | "2a" | "3" | "4" | "5" | "5a" | "6" | null
  hazardous: boolean | null; expiryTracked: boolean | null
  custodianUserId: string | null; custodianName: string | null
  serialNumber: string | null; purchaseDate: string | null; purchaseCost: number | null
  warrantyMonths: number | null; usefulLifeMonths: number | null; salvageValue: number | null
  depreciationMethod: "none" | "straight_line" | "reducing_balance" | null
  conditionKind: "new" | "good" | "fair" | "poor" | "retired" | null
  variants: Variant[]
}

interface PcbUsage {
  pcbId: string; pcbSlug: string; pcbName: string
  pcbRevisionId: string; rev: string; revisionStatus: string
  qty: number; refDes: string | null
}

// Where-used edge: one row per (parent → child) relation walked upwards
// from this item. Multiple edges together form the "used in" tree.
interface UsedInEdge {
  parentId: string; parentCode: string; parentName: string
  parentItemType: ItemType
  childId: string
  depth: number
}

interface StockRollup {
  itemId: string; code: string
  onHand: number; reserved: number; available: number; damaged: number
  byWarehouse: { warehouseId: string; code: string; onHand: number }[]
  byVariant: { variantId: string; sourceKind: "purchased" | "manufactured"; brandSlug: string | null; partNo: string | null; onHand: number; available: number }[]
  byLot: {
    lotNo: string; partNo: string | null; brandSlug: string | null
    supplierName: string | null; receivedDate: string | null
    expiryDate: string | null; unitCost: number | null; onHand: number; value: number
  }[]
}

interface LedgerRow {
  id: string; type: string; qtyDelta: number; runningBalance: number; variantId: string
  brandSlug: string | null; partNo: string | null
  warehouseCode: string | null; locationCode: string | null
  lotNo: string | null; supplierName: string | null
  refType: string | null; reason: string | null
  grnNo: string | null; note: string | null; createdByName: string | null
  createdAt: string
}

interface ItemBom {
  itemId: string
  versions: { id: string; version: string; status: string; effectiveFrom: string | null; effectiveTo: string | null; lineCount: number }[]
  selectedVersionId: string | null
  lines: {
    id: string; childItemId: string; childCode: string; childName: string; childGenericPn: string | null; childItemType: ItemType
    qty: number; refDes: string | null; preferredBrandSlug: string | null; sequence: number | null; remarks: string | null
    childHasBom: boolean
  }[]
}

type ItemStage = "under_production" | "production_complete" | "untested" | "testing" | "tested" | "faulty" | "finished"

interface SerialView { id: string; serialNo: string; stage: ItemStage; lotNo: string | null; notes: string | null; createdAt: string; updatedAt: string }
interface SerialsData {
  itemId: string; defaultStage: ItemStage
  stages: { stage: ItemStage; count: number; serials: SerialView[] }[]
  total: number
}

const TYPE_META: Record<ItemType, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  raw:            { label: "Raw",             icon: Nut,     tone: "bg-primary/10 text-primary border-primary/20" },
  sub_assembly: { label: "Sub-Assemblies",    icon: Cpu,     tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20" },
  finished_product:      { label: "Finished Products", icon: Package, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  consumable:     { label: "Consumable",      icon: Boxes,   tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  asset:          { label: "Asset",           icon: Laptop,  tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20" },
  packaging:      { label: "Packaging",       icon: Wrench,  tone: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
}
const STATUS_TONE: Record<ItemStatus, string> = {
  active:       "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  inactive:     "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20",
  discontinued: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
}
const STAGE_META: Record<ItemStage, { label: string; tone: string; bg: string }> = {
  under_production:    { label: "Under Production",    tone: "text-amber-700 dark:text-amber-400",    bg: "bg-amber-500/10 border-amber-500/25" },
  production_complete: { label: "Production Complete",  tone: "text-sky-700 dark:text-sky-400",        bg: "bg-sky-500/10 border-sky-500/25" },
  untested:            { label: "Untested",            tone: "text-slate-600 dark:text-slate-400",    bg: "bg-slate-500/10 border-slate-500/25" },
  testing:             { label: "Testing",             tone: "text-violet-700 dark:text-violet-400",  bg: "bg-violet-500/10 border-violet-500/25" },
  tested:              { label: "Tested",              tone: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/25" },
  faulty:              { label: "Faulty",              tone: "text-rose-700 dark:text-rose-400",      bg: "bg-rose-500/10 border-rose-500/25" },
  finished:            { label: "Finished",            tone: "text-primary",                          bg: "bg-primary/10 border-primary/25" },
}

const PURCHASED_STAGES: ItemStage[] = ["untested", "testing", "tested", "faulty"]
const MANUFACTURED_STAGES: ItemStage[] = ["under_production", "production_complete", "untested", "testing", "tested", "faulty", "finished"]

const CONDITION_TONE: Record<NonNullable<Item["conditionKind"]>, string> = {
  new:     "text-emerald-700 dark:text-emerald-400",
  good:    "text-primary",
  fair:    "text-amber-700 dark:text-amber-400",
  poor:    "text-orange-700 dark:text-orange-400",
  retired: "text-destructive",
}

const formatINR = (n: number, decimals = 2): string =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

export default function ItemDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  // "Back" and delete-redirect follow the workspace the user came from
  // (?from=inventory / products / pcb …) rather than always bouncing to
  // Items list. Falls through to path-derived workspace on direct hits.
  const back = backTargetForDetail(searchParams.get("from"), pathname)
  const fromId = searchParams.get("from")

  const [item, setItem] = React.useState<Item | null>(null)
  const [stock, setStock] = React.useState<StockRollup | null>(null)
  const [pcbUsage, setPcbUsage] = React.useState<PcbUsage[]>([])
  const [bom, setBom] = React.useState<ItemBom | null>(null)
  const [ledger, setLedger] = React.useState<LedgerRow[]>([])
  const [usedInTree, setUsedInTree] = React.useState<UsedInEdge[]>([])
  const [serials, setSerials] = React.useState<SerialsData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [toast, setToast] = React.useState<{ message: string; hint?: string; type: "success" | "error" | "info" } | null>(null)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [bomViewMode, setBomViewMode] = React.useState<"table" | "tree">("table")
  const [openingBalanceOpen, setOpeningBalanceOpen] = React.useState(false)
  // Floating "Jump to BOM" pill — visible while a BOM section exists and the
  // user hasn't scrolled it into view yet. An IntersectionObserver on the
  // anchor flips it off once the section crosses the viewport, so it doesn't
  // hover over content the user's already reading.
  const bomAnchorRef = React.useRef<HTMLDivElement | null>(null)
  const [bomInView, setBomInView] = React.useState(false)
  React.useEffect(() => {
    const el = bomAnchorRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => { setBomInView(entries[0]?.isIntersecting ?? false) },
      { rootMargin: "-80px 0px 0px 0px", threshold: 0.05 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [item?.itemType, bom?.versions.length])

  // Deep-link support: /items/details/[id]#bom-section (used by the BOM
  // buttons on the assembled / semi-assembled cards). Native anchor scroll
  // fires before the item finishes loading, so we defer until the section
  // is actually in the DOM and then jump to it — once per mount.
  const bomAutoScrolledRef = React.useRef(false)
  React.useEffect(() => {
    if (bomAutoScrolledRef.current) return
    if (typeof window === "undefined") return
    if (window.location.hash !== "#bom-section") return
    const el = bomAnchorRef.current
    if (!el) return
    bomAutoScrolledRef.current = true
    // rAF so layout has settled after the section mounted.
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }, [item?.itemType, bom?.versions.length])

  const showToast = React.useCallback((info: { message: string; hint?: string; type: "success" | "error" | "info" }) => {
    setToast(info); window.setTimeout(() => setToast(null), info.type === "error" ? 6000 : 3000)
  }, [])

  const load = React.useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [itemRes, stockRes, usageRes, bomRes, ledgerRes, treeRes, serialsRes] = await Promise.all([
        fetch(`/api/items/${encodeURIComponent(id)}`, { cache: "no-store" }),
        fetch(`/api/items/${encodeURIComponent(id)}/stock`, { cache: "no-store" }),
        fetch(`/api/items/${encodeURIComponent(id)}/pcb-usage`, { cache: "no-store" }),
        fetch(`/api/items/${encodeURIComponent(id)}/bom`, { cache: "no-store" }),
        fetch(`/api/items/${encodeURIComponent(id)}/ledger`, { cache: "no-store" }),
        fetch(`/api/items/${encodeURIComponent(id)}/used-in-tree`, { cache: "no-store" }),
        fetch(`/api/items/${encodeURIComponent(id)}/serials`, { cache: "no-store" }),
      ])
      if (!itemRes.ok) {
        const body = await itemRes.json().catch(() => null)
        throw new Error(extractError(body, `${itemRes.status} ${itemRes.statusText}`).message)
      }
      const itemBody = await itemRes.json() as { data: Item }
      setItem(itemBody.data)
      if (stockRes.ok) {
        const stockBody = await stockRes.json() as { data: StockRollup }
        setStock(stockBody.data)
      } else {
        setStock(null)
      }
      if (usageRes.ok) {
        const usageBody = await usageRes.json() as { data: PcbUsage[] }
        setPcbUsage(usageBody.data ?? [])
      } else {
        setPcbUsage([])
      }
      if (bomRes.ok) {
        const bomBody = await bomRes.json() as { data: ItemBom }
        setBom(bomBody.data)
      } else {
        setBom(null)
      }
      if (ledgerRes.ok) {
        const ledgerBody = await ledgerRes.json() as { data: LedgerRow[] }
        setLedger(ledgerBody.data ?? [])
      } else {
        setLedger([])
      }
      if (treeRes.ok) {
        const treeBody = await treeRes.json() as { data: { itemId: string; edges: UsedInEdge[] } }
        setUsedInTree(treeBody.data?.edges ?? [])
      } else {
        setUsedInTree([])
      }
      if (serialsRes.ok) {
        const serialsBody = await serialsRes.json() as { data: SerialsData }
        setSerials(serialsBody.data)
      } else {
        setSerials(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load item")
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => { void load() }, [load])

  const handleDelete = async () => {
    if (!item) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(item.id)}`, { method: "DELETE" })
      const body = await res.json().catch(() => null)
      if (!res.ok) { showToast({ ...extractError(body, "Failed to delete item"), type: "error" }); return }
      showToast({ message: `Deleted ${item.code}`, type: "success" })
      window.setTimeout(() => router.push(back.href), 700)
    } finally { setDeleting(false) }
  }

  if (loading && !item) return <DetailSkeleton />
  if (error) return (
    <div className="max-w-4xl mx-auto py-16">
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <h1 className="text-2xl font-extrabold text-destructive">Item not found</h1>
          <p className="text-sm text-muted-foreground max-w-md">{error}</p>
          <Link href={back.href} className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold hover:bg-muted/30">
            <ArrowLeft className="h-4 w-4" /> Back to {back.label}
          </Link>
        </CardContent>
      </Card>
    </div>
  )
  if (!item) return null

  const typeMeta = TYPE_META[item.itemType]
  const purchasedVariants = item.variants.filter((v) => v.sourceKind === "purchased")
  const manufactured     = item.variants.find((v) => v.sourceKind === "manufactured")
  const specsArr = Array.isArray(item.specs)
    ? (item.specs as { key?: string; value?: string }[]).filter((s) => s?.key)
    : []

  const hasStock     = item.minStock > 0 || item.reorderQty > 0 || item.safetyStock > 0 || item.leadTimeDays != null
  const hasBoard     = item.solderType != null || item.footprint != null || item.spq != null
  const hasPackaging = [item.packageLengthMm, item.packageWidthMm, item.packageHeightMm, item.packageWeightG, item.tareWeightG].some((v) => v != null)
                       || !!item.packageMaterial || item.packageReusable != null
  const hasStorage   = [item.storageTempMinC, item.storageTempMaxC, item.storageHumidityMinPct, item.storageHumidityMaxPct].some((v) => v != null)
                       || !!item.mslLevel || item.hazardous != null || item.expiryTracked != null
  const hasAsset     = !!item.custodianUserId || !!item.serialNumber || !!item.purchaseDate
                       || item.purchaseCost != null || item.warrantyMonths != null || item.usefulLifeMonths != null
                       || item.salvageValue != null || !!item.depreciationMethod || !!item.conditionKind

  return (
    <div className="pb-12 space-y-6">
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
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2 min-w-0">
          <div className="text-xs text-muted-foreground flex items-center gap-2 font-medium">
            <Link href={back.href} className="hover:text-foreground transition-colors">{back.label}</Link>
            <span>/</span>
            <span className="text-foreground font-semibold truncate">{item.name}</span>
          </div>
          <div className="flex items-start gap-3">
            <div className={`h-14 w-14 shrink-0 flex items-center justify-center rounded-2xl ${typeMeta.tone}`}>
              <typeMeta.icon className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-3">
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground truncate">{item.name}</h1>
                {stock && (
                  <span className={`shrink-0 text-sm font-bold ${stock.onHand > 0 ? (item.minStock > 0 && stock.onHand < item.minStock ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400") : "text-muted-foreground"}`}>
                    {stock.onHand.toLocaleString()} {item.baseUom}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-xs font-black bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded">
                  {item.code}
                </span>
                {item.genericPn && (
                  <span className="font-mono text-xs font-semibold bg-muted/40 border border-border text-foreground px-2 py-0.5 rounded">
                    GEN {item.genericPn}
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border ${typeMeta.tone}`}>
                  <typeMeta.icon className="h-3 w-3" /> {typeMeta.label}
                </span>
                <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold border ${STATUS_TONE[item.status]}`}>
                  {item.status}
                </span>
                <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border border-border bg-muted/30 text-muted-foreground">
                  {manufactured ? <Factory className="h-2.5 w-2.5" /> : <ShoppingBag className="h-2.5 w-2.5" />}
                  {manufactured ? "Made in-house" : "Purchased"}
                </span>
              </div>
              {item.description && (
                <p className="mt-3 text-sm text-muted-foreground max-w-3xl">{item.description}</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Link href={back.href} className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold hover:bg-muted/30">
            <ArrowLeft className="h-4 w-4" /> Back to {back.label}
          </Link>
          {item.variants.length > 0 && !manufactured && (
            <Link href="/components/inventory" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold hover:bg-muted/30"
              title="Stock In / Out is done from the Inventory screen">
              <PackagePlus className="h-4 w-4" /> Stock actions
            </Link>
          )}
          {/* Opening balance — writes into the Made-in-house variant, the
              slot the Stock In dialog intentionally hides. Shown for any
              manufactured item type with the variant present, so dual-sourced
              items (vendor variant + Made in-house) can still seed the made
              side separately from a Stock In receipt. */}
          {manufactured && (item.itemType === "sub_assembly" || item.itemType === "finished_product") && (
            <Button
              variant="outline"
              onClick={() => setOpeningBalanceOpen(true)}
              className="gap-1.5 border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
              title="Record units built before ERP tracking, or from a physical-count correction"
            >
              <Factory className="h-4 w-4" /> Record opening qty
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push(withFromParam(`/items/edit/${item.id}`, fromId))} className="gap-1.5">
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          <Button variant="outline" onClick={() => setConfirmingDelete(true)} className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/5">
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmingDelete && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-start gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-bold">Delete {item.code}?</p>
                <p className="text-xs mt-1 opacity-90">
                  This soft-deletes the item, its variants, and — for component-backed items — the underlying components row.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Cancel</Button>
              <Button size="sm" onClick={() => void handleDelete()} disabled={deleting} className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                <Trash2 className="h-3.5 w-3.5" /> {deleting ? "Deleting…" : "Yes, delete"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grid: main sections left, tall Inventory panel right.
          KPIs live INSIDE the left column so the right Inventory panel
          stretches from KPI level down to the BOM section start. */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        <div className="space-y-6 min-w-0">
          {/* Pieces by Stage — workflow pipeline for per-piece tracking */}
          <PiecesByStageSection
            serials={serials}
            itemType={item.itemType}
            manufactured={!!manufactured}
          />

          {/* Identity / master */}
          <SectionCard icon={Layers} title="Master">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <KV label="Category"     value={item.categoryPath ?? "—"} />
              <KV label="Base UOM"     value={item.baseUom} mono />
              {hasStock && (
                <>
                  <KV label="Min stock"    value={item.minStock.toLocaleString()} mono />
                  <KV label="Reorder qty"  value={item.reorderQty.toLocaleString()} mono />
                  <KV label="Safety stock" value={item.safetyStock.toLocaleString()} mono />
                  <KV label="Lead time"    value={item.leadTimeDays != null ? `${item.leadTimeDays} d` : "—"} mono />
                </>
              )}
            </div>
          </SectionCard>

          {/* Manufacturer variants */}
          {item.variants.length > 0 && (
            <SectionCard icon={Factory} title={manufactured && purchasedVariants.length === 0 ? "Manufacture" : "Manufacturer Variants"}>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="text-[10px] uppercase bg-muted/40 text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-4 py-2 text-left font-bold">Source</th>
                      <th className="px-4 py-2 text-left font-bold">Brand</th>
                      <th className="px-4 py-2 text-left font-bold">MPN</th>
                      <th className="px-4 py-2 text-center font-bold w-24">Default</th>
                      {stock && <th className="px-4 py-2 text-right font-bold w-24">On hand</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {item.variants.map((v) => {
                      const stockV = stock?.byVariant.find((s) => s.variantId === v.id)
                      return (
                        <tr key={v.id} className="hover:bg-muted/10">
                          <td className="px-4 py-2">
                            <span className={`inline-flex rounded px-1.5 py-0.5 border font-bold text-[11px] ${
                              v.sourceKind === "manufactured"
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                                : "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20"
                            }`}>{v.sourceKind}</span>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{v.brandSlug ?? "—"}</td>
                          <td className="px-4 py-2 font-mono text-muted-foreground">{v.partNo ?? "—"}</td>
                          <td className="px-4 py-2 text-center">
                            {v.isDefault ? <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span> : <span className="text-muted-foreground/40">—</span>}
                          </td>
                          {stock && (
                            <td className="px-4 py-2 text-right font-mono font-semibold">
                              {stockV ? stockV.onHand.toLocaleString() : "0"}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* PCB usage — which live PCB revisions include this item in their BOM */}
          {pcbUsage.length > 0 && (
            <SectionCard icon={GitBranch} title={`Used in ${pcbUsage.length === 1 ? "1 PCB revision" : `${pcbUsage.length} PCB revisions`}`}>
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="text-[10px] uppercase bg-muted/40 text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-4 py-2 text-left font-bold">PCB</th>
                      <th className="px-4 py-2 text-left font-bold w-24">Revision</th>
                      <th className="px-4 py-2 text-left font-bold w-28">Status</th>
                      <th className="px-4 py-2 text-left font-bold">Ref-des</th>
                      <th className="px-4 py-2 text-right font-bold w-24">Qty</th>
                      <th className="px-4 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pcbUsage.map((u) => {
                      // `bom_status` enum values are capitalised (Draft / Active / Superseded / Obsolete).
                      const statusTone =
                        u.revisionStatus === "Active"     ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                        : u.revisionStatus === "Draft"      ? "bg-amber-500/10   text-amber-700   dark:text-amber-400   border-amber-500/20"
                        : u.revisionStatus === "Superseded" ? "bg-slate-500/10   text-slate-700   dark:text-slate-400   border-slate-500/20"
                        : /* Obsolete */                      "bg-rose-500/10    text-rose-700    dark:text-rose-400    border-rose-500/20"
                      return (
                        <tr key={`${u.pcbRevisionId}-${u.refDes ?? ""}`} className="hover:bg-muted/10">
                          <td className="px-4 py-2">
                            <Link
                              href={`/pcb-management/structure?pcb=${encodeURIComponent(u.pcbSlug)}&revision=${encodeURIComponent(u.pcbRevisionId)}`}
                              className="font-semibold text-foreground hover:text-primary hover:underline"
                            >
                              {u.pcbName}
                            </Link>
                          </td>
                          <td className="px-4 py-2 font-mono">Rev {u.rev}</td>
                          <td className="px-4 py-2">
                            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold border ${statusTone}`}>
                              {u.revisionStatus}
                            </span>
                          </td>
                          <td className="px-4 py-2 font-mono text-muted-foreground">{u.refDes ?? "—"}</td>
                          <td className="px-4 py-2 text-right font-mono font-semibold">{u.qty.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">
                            <Link
                              href={`/pcb-management/structure?pcb=${encodeURIComponent(u.pcbSlug)}&revision=${encodeURIComponent(u.pcbRevisionId)}`}
                              className="text-primary text-xs font-semibold hover:underline"
                              aria-label="Open PCB structure"
                            >
                              →
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* Board Info */}
          {hasBoard && (
            <SectionCard icon={Cpu} title="Board Info">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <KV label="Solder type" value={item.solderType ?? "—"} />
                <KV label="Footprint"   value={item.footprint ?? "—"} mono />
                <KV label="SPQ"         value={item.spq != null ? item.spq.toLocaleString() : "—"} mono />
              </div>
            </SectionCard>
          )}

          {/* Packaging */}
          {hasPackaging && (
            <SectionCard icon={Package} title="Packaging">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <KV label="L × W × H"    value={[item.packageLengthMm, item.packageWidthMm, item.packageHeightMm].every((v) => v != null)
                                                ? `${item.packageLengthMm} × ${item.packageWidthMm} × ${item.packageHeightMm} mm`
                                                : "—"} mono />
                <KV label="Unit weight"  value={item.packageWeightG != null ? `${item.packageWeightG.toLocaleString()} g` : "—"} mono />
                <KV label="Tare weight"  value={item.tareWeightG    != null ? `${item.tareWeightG.toLocaleString()} g` : "—"} mono />
                <KV label="Material"     value={item.packageMaterial ?? "—"} />
                <KV label="Reusable"     value={item.packageReusable == null ? "—" : (item.packageReusable ? "Yes" : "No")} />
              </div>
            </SectionCard>
          )}

          {/* Storage / MSL */}
          {hasStorage && (
            <SectionCard icon={Wrench} title="Storage / MSL">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <KV label="Temperature" value={
                  item.storageTempMinC != null && item.storageTempMaxC != null ? `${item.storageTempMinC}°C … ${item.storageTempMaxC}°C`
                  : item.storageTempMinC != null ? `≥ ${item.storageTempMinC}°C`
                  : item.storageTempMaxC != null ? `≤ ${item.storageTempMaxC}°C`
                  : "—"
                } mono />
                <KV label="Humidity" value={
                  item.storageHumidityMinPct != null && item.storageHumidityMaxPct != null ? `${item.storageHumidityMinPct}% … ${item.storageHumidityMaxPct}%`
                  : item.storageHumidityMinPct != null ? `≥ ${item.storageHumidityMinPct}% RH`
                  : item.storageHumidityMaxPct != null ? `≤ ${item.storageHumidityMaxPct}% RH`
                  : "—"
                } mono />
                <KV label="MSL level"       value={item.mslLevel ?? "—"} mono />
                <KV label="Hazardous"       value={item.hazardous == null ? "—" : (item.hazardous ? "Yes — hazardous" : "No")} />
                <KV label="Expiry-tracked"  value={item.expiryTracked == null ? "—" : (item.expiryTracked ? "Yes" : "No")} />
              </div>
            </SectionCard>
          )}

          {/* Asset Details */}
          {hasAsset && (
            <SectionCard icon={Laptop} title="Asset Details">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <KV label="Custodian"      value={item.custodianName ?? "—"} />
                <KV label="Serial no"      value={item.serialNumber ?? "—"} mono />
                <KV label="Purchase date"  value={item.purchaseDate ?? "—"} mono />
                <KV label="Purchase cost"  value={item.purchaseCost != null ? formatINR(item.purchaseCost) : "—"} mono />
                <KV label="Warranty"       value={item.warrantyMonths != null ? `${item.warrantyMonths} months` : "—"} mono />
                <KV label="Useful life"    value={item.usefulLifeMonths != null ? `${item.usefulLifeMonths} months` : "—"} mono />
                <KV label="Salvage value"  value={item.salvageValue != null ? formatINR(item.salvageValue) : "—"} mono />
                <KV label="Depreciation"   value={item.depreciationMethod ? item.depreciationMethod.replace("_", " ") : "—"} />
                <KV label="Condition"      value={
                  item.conditionKind
                    ? <span className={`font-bold ${CONDITION_TONE[item.conditionKind]}`}>{item.conditionKind}</span>
                    : "—"
                } />
              </div>
            </SectionCard>
          )}

          {/* Specifications */}
          {specsArr.length > 0 && (
            <SectionCard icon={Sliders} title="Specifications">
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    {specsArr.map((s, i) => (
                      <tr key={i} className="hover:bg-muted/10">
                        <td className="px-4 py-2 font-bold text-muted-foreground w-1/3">{s.key}</td>
                        <td className="px-4 py-2 font-mono">{s.value ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          {/* Movement history */}
          <MovementHistorySection ledger={ledger} baseUom={item.baseUom} />
        </div>

        {/* Right side: one tall Inventory panel. Stretches to the height of
            the left column (KPI strip + sections) via `self-stretch`, so it
            sits flush with the BOM section start regardless of how many
            left-hand sections render. */}
        {/* Sidebar. Was `self-stretch` with one full-height Inventory card
            when it held a single panel; now that it stacks a Used-in card on
            top, the flex-full-height trick lets the Inventory card spill
            over the BOM section below. Sticky positioning keeps the whole
            sidebar in view as the user scrolls the long left column. */}
        <aside className="space-y-6 lg:sticky lg:top-4 lg:self-start">
          {/* Where used — walked upwards through the BOM graph. Empty state
              stays visible so operators know the check ran; a raw part not
              yet placed on any BOM is common in a fresh catalog. */}
          <UsedInTreeCard rootId={item.id} rootCode={item.code} rootName={item.name} edges={usedInTree} />
          <Card className="border border-border shadow-sm overflow-hidden">
            <CardHeader className="border-b border-border bg-muted/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <Boxes className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-bold">Inventory</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {stock ? (
                <>
                  {/* Damaged summary — folded in here from the removed top KPI. */}
                  <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-destructive/80">Damaged</div>
                    <div className="mt-0.5 flex items-baseline gap-1.5">
                      <span className={`text-2xl font-extrabold font-mono ${stock.damaged > 0 ? "text-destructive" : "text-muted-foreground/60"}`}>
                        {stock.damaged.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{item.baseUom}</span>
                    </div>
                  </div>

                  {stock.byWarehouse.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                        <Boxes className="h-3.5 w-3.5" /> By warehouse
                      </div>
                      <ul className="text-sm divide-y divide-border rounded-lg border border-border/60">
                        {stock.byWarehouse.map((w) => (
                          <li key={w.warehouseId} className="flex items-center justify-between px-3 py-1.5">
                            <span className="font-semibold">{w.code}</span>
                            <span className="font-mono">{w.onHand.toLocaleString()}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {stock.byLot.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                        <Layers className="h-3.5 w-3.5" /> Lots (FEFO)
                      </div>
                      <ul className="divide-y divide-border rounded-lg border border-border/60">
                        {stock.byLot.map((l, i) => (
                          <li key={i} className="py-2 px-3 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono font-semibold text-xs truncate">{l.lotNo}</span>
                              <span className="font-mono text-sm font-bold">{l.onHand.toLocaleString()}</span>
                            </div>
                            <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                              {l.brandSlug && <><dt className="font-semibold">Mfr</dt><dd className="text-right truncate">{l.brandSlug}</dd></>}
                              {l.partNo && <><dt className="font-semibold">MPN</dt><dd className="text-right font-mono truncate">{l.partNo}</dd></>}
                              <dt className="font-semibold">Supplier</dt><dd className="text-right truncate">{l.supplierName ?? "—"}</dd>
                              <dt className="font-semibold">Arrived</dt><dd className="text-right">{l.receivedDate ?? "—"}</dd>
                              <dt className="font-semibold">Expiry</dt>
                              <dd className={`text-right ${l.expiryDate ? "" : "text-muted-foreground/60"}`}>{l.expiryDate ?? "no expiry"}</dd>
                              {l.unitCost != null && <><dt className="font-semibold">Unit cost</dt><dd className="text-right font-mono">{formatINR(l.unitCost)}</dd></>}
                              {l.value > 0 && <><dt className="font-semibold">Value</dt><dd className="text-right font-mono">{formatINR(l.value)}</dd></>}
                            </dl>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {stock.onHand === 0 && (
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 flex items-start gap-2">
                      <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        No stock on hand yet. {item.itemType === "finished_product" || item.itemType === "sub_assembly"
                          ? "Post a production run to project into the ledger."
                          : "Receive a PO or add an opening quantity to start tracking."}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    No inventory data — this item type doesn&apos;t hold stock.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Bill of Materials — full-width, so wide columns and the assembly
          tree get the room they need. Raw items skip the section entirely
          (raw = foundational, no BOM). Anchor sits just above the section
          card so the scroll-to lands on the section header, not mid-card. */}
      {item.itemType !== "raw" && (
        <div ref={bomAnchorRef} id="bom-section" className="scroll-mt-24">
          {(!bom || bom.versions.length === 0) && (
            <SectionCard icon={Layers} title="Bill of Materials">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground flex-1 min-w-[200px]">
                  No BOM defined yet. Create the first version to list the child items that make up this {TYPE_META[item.itemType].label.toLowerCase()}.
                </p>
                <Link
                  href={withFromParam(`/items/${encodeURIComponent(id)}/bom`, fromId)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-bold hover:opacity-90"
                >
                  <Pencil className="h-3.5 w-3.5" /> Create BOM
                </Link>
              </div>
            </SectionCard>
          )}
          {bom && bom.versions.length > 0 && (
            <BomSection
              itemId={id}
              bom={bom}
              viewMode={bomViewMode}
              setViewMode={setBomViewMode}
              fromId={fromId}
            />
          )}
        </div>
      )}

      {/* Floating "Jump to BOM" pill — only when a BOM section exists on the
          page AND the user hasn't scrolled it into view yet. Hides itself
          once the anchor crosses the viewport (via the observer above). */}
      {item.itemType !== "raw" && !bomInView && (
        <button
          type="button"
          onClick={() => bomAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary text-primary-foreground px-4 py-2.5 text-sm font-bold shadow-lg hover:opacity-90 transition-all animate-in fade-in slide-in-from-bottom-3"
          aria-label="Jump to Bill of Materials"
        >
          <Layers className="h-4 w-4" />
          <span>View BOM</span>
          <ArrowDown className="h-3.5 w-3.5 opacity-80" />
        </button>
      )}

      {/* Opening-balance dialog for made-in-house items. Reload the page's
          stock rollup after a successful record so KPI + Inventory panel
          reflect the new on-hand immediately. */}
      {openingBalanceOpen && manufactured && (
        <ItemOpeningBalanceDialog
          item={{
            id: item.id,
            code: item.code,
            name: item.name,
            baseUom: item.baseUom,
            manufacturedVariantId: manufactured.id,
          }}
          onClose={() => setOpeningBalanceOpen(false)}
          onDone={(msg) => {
            setOpeningBalanceOpen(false)
            showToast({ message: msg, type: "success" })
            void load()
          }}
        />
      )}
    </div>
  )
}

// ── BOM section — full-width, view-mode toggle, wider table + tree ─────────
type BomLine = ItemBom["lines"][number]

function BomSection({
  itemId, bom, viewMode, setViewMode, fromId,
}: {
  itemId: string
  bom: ItemBom
  viewMode: "table" | "tree"
  setViewMode: (m: "table" | "tree") => void
  fromId: string | null
}) {
  const active = bom.versions.find((v) => v.id === bom.selectedVersionId)
  const totalQty = bom.lines.reduce((s, l) => s + l.qty, 0)
  return (
    <Card className="border border-border shadow-sm overflow-hidden">
      <CardHeader className="border-b border-border bg-muted/10 px-4 py-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            {viewMode === "tree" ? <ListTree className="h-4 w-4 text-primary" /> : <Table2 className="h-4 w-4 text-primary" />}
            <CardTitle className="text-sm font-bold">Bill of Materials</CardTitle>
            <div className="flex items-center gap-2 text-xs ml-2">
              <span className="text-muted-foreground">Version:</span>
              <span className="font-mono font-bold text-foreground">{active?.version ?? "—"}</span>
              {active && (
                <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold border ${
                  active.status === "Active"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                    : "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20"
                }`}>{active.status}</span>
              )}
              {bom.versions.length > 1 && (
                <span className="text-muted-foreground/70">· {bom.versions.length} versions</span>
              )}
              <span className="text-muted-foreground/70">· {bom.lines.length} line{bom.lines.length === 1 ? "" : "s"} · Σ qty {totalQty.toLocaleString()}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start md:self-auto">
            {/* View mode switch */}
            <div className="inline-flex shrink-0 items-center rounded-lg border border-border bg-background p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode("tree")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                  viewMode === "tree" ? "bg-primary text-primary-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ListTree className="h-3.5 w-3.5" /><span>Tree</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                  viewMode === "table" ? "bg-primary text-primary-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Table2 className="h-3.5 w-3.5" /><span>Table</span>
              </button>
            </div>
            <Link
              href={withFromParam(`/items/${encodeURIComponent(itemId)}/bom`, fromId)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold hover:opacity-90"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit BOM
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {bom.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground p-6 text-center">This version has no lines.</p>
        ) : viewMode === "table" ? (
          <BomTableView lines={bom.lines} fromId={fromId} />
        ) : (
          <BomTreeView lines={bom.lines} fromId={fromId} />
        )}
      </CardContent>
    </Card>
  )
}

// Recursion cap on the details-page Table view. Matches the BOM editor's
// Tree view — a card past the cap loses its chevron and shows a "drill in
// via the child's BOM page" hint. Guards against any accidental cycle.
const BOM_TABLE_MAX_DEPTH = 8

function BomTableView({ lines, fromId }: { lines: BomLine[]; fromId: string | null }) {
  // Lazy sub-BOM cache + expand set + in-flight guard. Fetches once per
  // childItemId and reuses across every row that references it. Recursively
  // consulted, so a nested chevron in an expanded sub-row re-uses the same
  // state — no per-level React tree state to thread through.
  const [subBomByChild, setSubBomByChild] = React.useState<Record<string, BomLine[]>>({})
  const [loading, setLoading] = React.useState<Set<string>>(new Set())
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())

  const loadSubBom = React.useCallback(async (childItemId: string) => {
    if (!childItemId || subBomByChild[childItemId] || loading.has(childItemId)) return
    setLoading((prev) => new Set(prev).add(childItemId))
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(childItemId)}/bom`, { cache: "no-store" })
      if (res.ok) {
        const body = await res.json() as { data: { lines: BomLine[] } }
        setSubBomByChild((prev) => ({ ...prev, [childItemId]: body.data.lines }))
      }
    } finally {
      setLoading((prev) => { const next = new Set(prev); next.delete(childItemId); return next })
    }
  }, [subBomByChild, loading])

  const toggle = React.useCallback((childItemId: string) => {
    if (!childItemId) return
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(childItemId)) next.delete(childItemId)
      else { next.add(childItemId); void loadSubBom(childItemId) }
      return next
    })
  }, [loadSubBom])

  const collapseAll = React.useCallback(() => setExpanded(new Set()), [])

  // Depth-aware row rendering, flattened into a single tbody so column
  // alignment stays perfect. Depth pads the Child-item cell and tints the
  // row background so nested lines visually nest.
  const renderRow = (l: BomLine, idx: number, depth: number, keyPrefix: string): React.ReactNode[] => {
    const cMeta = TYPE_META[l.childItemType]
    const canExpand = l.childHasBom && depth < BOM_TABLE_MAX_DEPTH
    const isExpanded = canExpand && expanded.has(l.childItemId)
    const isLoading = loading.has(l.childItemId)
    const subLines = subBomByChild[l.childItemId]
    const atMaxDepth = l.childHasBom && depth >= BOM_TABLE_MAX_DEPTH
    // Depth tint deepens the sub-row background just enough to read as nested.
    const bgTone =
      depth === 0 ? "hover:bg-muted/10" :
      depth === 1 ? "bg-muted/10 hover:bg-muted/20" :
      depth === 2 ? "bg-muted/20 hover:bg-muted/30" :
                    "bg-muted/30 hover:bg-muted/40"

    const rows: React.ReactNode[] = [
      <tr key={`${keyPrefix}-${l.id}`} className={bgTone}>
        <td className="px-2 py-2 text-center align-top">
          {canExpand ? (
            <button
              type="button"
              onClick={() => toggle(l.childItemId)}
              className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted/60 text-muted-foreground"
              title={isExpanded ? "Collapse sub-BOM" : "Expand sub-BOM"}
              aria-label={isExpanded ? "Collapse sub-BOM" : "Expand sub-BOM"}
            >
              {isLoading
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : isExpanded
                  ? <ChevronDown className="h-3 w-3" />
                  : <ChevronRight className="h-3 w-3" />}
            </button>
          ) : (
            <span className="text-[11px] font-mono text-muted-foreground">{idx + 1}</span>
          )}
        </td>
        <td className="px-3 py-2" style={{ paddingLeft: `${12 + depth * 20}px` }}>
          <div className="flex items-center gap-2 min-w-0">
            <cMeta.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Link href={withFromParam(`/items/details/${l.childItemId}`, fromId)} className="font-semibold text-primary hover:underline truncate">
              {l.childName}
            </Link>
            {l.childHasBom && (
              <Link
                href={withFromParam(`/items/${encodeURIComponent(l.childItemId)}/bom`, fromId)}
                className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase rounded border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 px-1 py-0.5 hover:bg-sky-500/20"
                title="Open this child's BOM in the editor"
              >
                sub-BOM <ChevronRight className="h-2.5 w-2.5" />
              </Link>
            )}
            {atMaxDepth && (
              <span className="text-[9px] font-bold uppercase text-amber-600 dark:text-amber-400" title="Max depth reached — open the child's BOM page to keep drilling">
                max depth
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{l.childCode}</td>
        <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{l.childGenericPn ?? "—"}</td>
        <td className="px-3 py-2">
          <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground font-mono">
            {cMeta.label}
          </span>
        </td>
        <td className="px-3 py-2 text-right font-mono font-bold text-primary">{l.qty.toLocaleString()}</td>
        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{l.refDes ?? "—"}</td>
        <td className="px-3 py-2 text-xs">{l.preferredBrandSlug ?? <span className="text-muted-foreground/60 italic">—</span>}</td>
        <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">{l.sequence ?? "—"}</td>
        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-normal">{l.remarks ?? "—"}</td>
      </tr>,
    ]

    if (isExpanded) {
      if (subLines) {
        if (subLines.length === 0) {
          rows.push(
            <tr key={`${keyPrefix}-${l.id}-empty`} className={bgTone}>
              <td className="px-2 py-1.5" />
              <td className="px-3 py-1.5 text-[11px] italic text-muted-foreground" colSpan={9} style={{ paddingLeft: `${12 + (depth + 1) * 20}px` }}>
                No lines on this sub-BOM.
              </td>
            </tr>
          )
        } else {
          subLines.forEach((sub, subIdx) => {
            rows.push(...renderRow(sub, subIdx, depth + 1, `${keyPrefix}-${l.id}`))
          })
        }
      } else if (isLoading) {
        rows.push(
          <tr key={`${keyPrefix}-${l.id}-loading`} className={bgTone}>
            <td className="px-2 py-1.5" />
            <td className="px-3 py-1.5 text-[11px] italic text-muted-foreground inline-flex items-center gap-1.5" colSpan={9} style={{ paddingLeft: `${12 + (depth + 1) * 20}px` }}>
              <Loader2 className="h-3 w-3 animate-spin" /> Loading sub-BOM…
            </td>
          </tr>
        )
      } else {
        rows.push(
          <tr key={`${keyPrefix}-${l.id}-error`} className={bgTone}>
            <td className="px-2 py-1.5" />
            <td className="px-3 py-1.5 text-[11px] italic text-muted-foreground" colSpan={9} style={{ paddingLeft: `${12 + (depth + 1) * 20}px` }}>
              Failed to load sub-BOM.
            </td>
          </tr>
        )
      }
    }

    return rows
  }

  return (
    <DragScrollArea className="overflow-x-auto">
      {expanded.size > 0 && (
        <div className="flex justify-end px-4 pt-3">
          <button
            type="button"
            onClick={collapseAll}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="h-3 w-3" /> Collapse all sub-BOMs
          </button>
        </div>
      )}
      <table className="w-full text-sm min-w-[1150px]">
        <thead className="text-[10px] uppercase bg-muted/40 text-muted-foreground border-b border-border">
          <tr>
            <th className="px-2 py-2 text-center font-bold w-10">#</th>
            <th className="px-3 py-2 text-left font-bold min-w-[240px]">Child item</th>
            <th className="px-3 py-2 text-left font-bold w-32">Code</th>
            <th className="px-3 py-2 text-left font-bold w-32">Generic PN</th>
            <th className="px-3 py-2 text-left font-bold w-28">Type</th>
            <th className="px-3 py-2 text-right font-bold w-20">Qty</th>
            <th className="px-3 py-2 text-left font-bold w-32">Ref des</th>
            <th className="px-3 py-2 text-left font-bold w-32">Preferred brand</th>
            <th className="px-3 py-2 text-right font-bold w-16">Seq</th>
            <th className="px-3 py-2 text-left font-bold">Remarks</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {lines.flatMap((l, idx) => renderRow(l, idx, 0, "root"))}
        </tbody>
      </table>
    </DragScrollArea>
  )
}

function BomTreeView({ lines, fromId }: { lines: BomLine[]; fromId: string | null }) {
  return (
    <DragScrollArea className="p-6 md:p-8 overflow-x-auto">
      <div className="relative pl-6 space-y-5 before:absolute before:left-3.5 before:top-0 before:bottom-3 before:w-[2px] before:bg-border/60">
        {lines.map((l) => {
          const cMeta = TYPE_META[l.childItemType]
          return (
            <div key={l.id} className="relative">
              <div className="absolute -left-6 top-5 w-6 h-[2px] border-t-2 border-dashed border-border" />
              <div className="flex flex-col gap-1.5 w-full max-w-md bg-background border border-border/80 rounded-xl p-3.5 relative z-10 shadow-2xs hover:border-primary/40 transition-all">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <cMeta.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Link
                      href={withFromParam(`/items/details/${l.childItemId}`, fromId)}
                      className="font-bold text-foreground text-xs hover:text-primary hover:underline truncate"
                    >
                      {l.childName}
                    </Link>
                    {l.childHasBom && (
                      <Link
                        href={withFromParam(`/items/${encodeURIComponent(l.childItemId)}/bom`, fromId)}
                        className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase rounded border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 px-1 py-0.5 hover:bg-sky-500/20"
                        title="This child is a sub-assembly — click to view its BOM"
                      >
                        sub-BOM <ChevronRight className="h-2.5 w-2.5" />
                      </Link>
                    )}
                  </div>
                  <span className="font-mono text-xs font-bold text-primary shrink-0">× {l.qty.toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-2 pt-2 border-t border-border/40 text-[10px]">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">Code</span>
                    <span className="font-mono font-bold text-primary truncate">{l.childCode}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">Type</span>
                    <span className="font-bold text-foreground">{cMeta.label}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">Generic PN</span>
                    <span className="font-mono text-foreground truncate">{l.childGenericPn ?? "—"}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">Qty</span>
                    <span className="font-mono font-bold text-primary">{l.qty.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">Ref des</span>
                    <span className="font-mono text-foreground truncate">{l.refDes ?? "—"}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">Preferred brand</span>
                    <span className="font-semibold text-foreground truncate">{l.preferredBrandSlug ?? "—"}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">Seq</span>
                    <span className="font-mono text-foreground">{l.sequence ?? "—"}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">Sub-BOM</span>
                    <span className={`font-bold ${l.childHasBom ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground/60"}`}>
                      {l.childHasBom ? "yes" : "—"}
                    </span>
                  </div>
                  <div className="col-span-2 flex flex-col">
                    <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">Remarks</span>
                    <span className="text-foreground/80 whitespace-normal break-words">{l.remarks ?? "—"}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </DragScrollArea>
  )
}

// ── Movement History — enhanced ledger ──────────────────────────────────────

const TXN_TYPE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  IN:          { label: "Stock In",     icon: ArrowDownLeft,  tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  PRODUCTION:  { label: "Production",   icon: Factory,        tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  RETURN:      { label: "Return",       icon: ArrowDownLeft,  tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  OUT:         { label: "Stock Out",    icon: ArrowUpRight,   tone: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20" },
  CONSUMPTION: { label: "Consumption",  icon: ArrowUpRight,   tone: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20" },
  TRANSFER:    { label: "Transfer",     icon: ArrowLeftRight, tone: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20" },
  ADJUSTMENT:  { label: "Adjustment",   icon: Sliders,        tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" },
}

const TXN_FILTERS = ["ALL", "IN", "OUT", "TRANSFER", "ADJUSTMENT", "PRODUCTION", "CONSUMPTION", "RETURN"] as const

function MovementHistorySection({ ledger, baseUom }: { ledger: LedgerRow[]; baseUom: string }) {
  const [filter, setFilter] = React.useState<string>("ALL")
  const [expandedId, setExpandedId] = React.useState<string | null>(null)

  const filtered = filter === "ALL" ? ledger : ledger.filter((m) => m.type === filter)

  const totalIn = ledger.reduce((s, m) => s + (m.qtyDelta > 0 ? m.qtyDelta : 0), 0)
  const totalOut = ledger.reduce((s, m) => s + (m.qtyDelta < 0 ? -m.qtyDelta : 0), 0)

  return (
    <Card className="border border-border shadow-sm overflow-hidden">
      <CardHeader className="border-b border-border bg-muted/10 px-4 py-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-bold">Movement History</CardTitle>
            <span className="text-[10px] text-muted-foreground font-semibold ml-1">
              {ledger.length} movement{ledger.length === 1 ? "" : "s"}
            </span>
          </div>
          {/* Summary chips */}
          {ledger.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2.5 py-0.5 text-[10px] font-bold">
                <ArrowDownLeft className="h-2.5 w-2.5" /> In {totalIn.toLocaleString()} {baseUom}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 px-2.5 py-0.5 text-[10px] font-bold">
                <ArrowUpRight className="h-2.5 w-2.5" /> Out {totalOut.toLocaleString()} {baseUom}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[10px] font-bold">
                Net {(totalIn - totalOut).toLocaleString()} {baseUom}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {ledger.length === 0 ? (
          <div className="p-5 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">No inventory movements recorded yet.</p>
          </div>
        ) : (
          <>
            {/* Type filter tabs */}
            <div className="flex items-center gap-1 px-4 pt-3 pb-2 overflow-x-auto">
              {TXN_FILTERS.map((t) => {
                const count = t === "ALL" ? ledger.length : ledger.filter((m) => m.type === t).length
                if (t !== "ALL" && count === 0) return null
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFilter(t)}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                      filter === t
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                    }`}
                  >
                    {t === "ALL" ? "All" : (TXN_TYPE_META[t]?.label ?? t)}
                    <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[9px] ${
                      filter === t ? "bg-primary-foreground/20" : "bg-background/60"
                    }`}>{count}</span>
                  </button>
                )
              })}
            </div>

            <DragScrollArea className="overflow-x-auto">
              <div className="max-h-[480px] overflow-y-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="text-[10px] uppercase bg-muted/40 text-muted-foreground border-y border-border sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold w-36">When</th>
                      <th className="px-3 py-2 text-left font-bold w-28">Type</th>
                      <th className="px-3 py-2 text-right font-bold w-20">Qty</th>
                      <th className="px-3 py-2 text-right font-bold w-24">Balance</th>
                      <th className="px-3 py-2 text-left font-bold w-32">Location</th>
                      <th className="px-3 py-2 text-left font-bold w-36">Lot</th>
                      <th className="px-3 py-2 text-left font-bold">Details</th>
                      <th className="px-3 py-2 text-left font-bold w-28">By</th>
                      <th className="px-2 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((m) => {
                      const inbound = m.qtyDelta > 0
                      const meta = TXN_TYPE_META[m.type] ?? TXN_TYPE_META.ADJUSTMENT
                      const TxnIcon = meta.icon
                      const hasDetail = !!(m.note || m.grnNo || m.reason)
                      const isExpanded = expandedId === m.id
                      return (
                        <React.Fragment key={m.id}>
                          <tr className={`hover:bg-muted/10 ${isExpanded ? "bg-muted/10" : ""}`}>
                            <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(m.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold border ${meta.tone}`}>
                                <TxnIcon className="h-2.5 w-2.5" />
                                {meta.label}
                              </span>
                            </td>
                            <td className={`px-3 py-2 text-right font-mono font-bold ${inbound ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                              {inbound ? "+" : ""}{m.qtyDelta.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs font-semibold text-foreground/70">
                              {m.runningBalance.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                              {m.warehouseCode ? `${m.warehouseCode}${m.locationCode ? ` · ${m.locationCode}` : ""}` : "—"}
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {m.lotNo ? <span className="font-mono text-muted-foreground">{m.lotNo}</span> : <span className="text-muted-foreground/40">—</span>}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {m.supplierName && <span>{m.supplierName}</span>}
                              {m.supplierName && m.refType && <span> · </span>}
                              {m.refType && <span className="italic">{m.refType}{m.grnNo ? ` (${m.grnNo})` : ""}</span>}
                              {!m.supplierName && !m.refType && m.reason && <span className="italic">{m.reason}</span>}
                              {!m.supplierName && !m.refType && !m.reason && "—"}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[120px]">
                              {m.createdByName ? (
                                <span className="inline-flex items-center gap-1" title={m.createdByName}>
                                  <User className="h-2.5 w-2.5 shrink-0" /> {m.createdByName}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="px-2 py-2">
                              {hasDetail && (
                                <button
                                  type="button"
                                  onClick={() => setExpandedId(isExpanded ? null : m.id)}
                                  className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted/60 text-muted-foreground"
                                  title={isExpanded ? "Hide details" : "Show details"}
                                >
                                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                </button>
                              )}
                            </td>
                          </tr>
                          {isExpanded && hasDetail && (
                            <tr className="bg-muted/5">
                              <td colSpan={9} className="px-4 py-2">
                                <div className="flex flex-wrap gap-4 text-xs">
                                  {m.grnNo && (
                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                      <FileText className="h-3 w-3 shrink-0" />
                                      <span className="font-semibold">GRN:</span>
                                      <span className="font-mono">{m.grnNo}</span>
                                    </div>
                                  )}
                                  {m.reason && (
                                    <div className="flex items-center gap-1.5 text-muted-foreground">
                                      <Info className="h-3 w-3 shrink-0" />
                                      <span className="font-semibold">Reason:</span>
                                      <span>{m.reason}</span>
                                    </div>
                                  )}
                                  {m.note && (
                                    <div className="flex items-start gap-1.5 text-muted-foreground">
                                      <StickyNote className="h-3 w-3 shrink-0 mt-0.5" />
                                      <span className="font-semibold">Note:</span>
                                      <span className="whitespace-pre-wrap">{m.note}</span>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </DragScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── Pieces by Stage — horizontal pipeline ──────────────────────────────────

function PiecesByStageSection({ serials, itemType, manufactured }: {
  serials: SerialsData | null
  itemType: ItemType
  manufactured: boolean
}) {
  const stages = manufactured ? MANUFACTURED_STAGES : PURCHASED_STAGES
  const stageMap = React.useMemo(() => {
    const m = new Map<ItemStage, SerialView[]>()
    if (serials) {
      for (const s of serials.stages) m.set(s.stage, s.serials)
    }
    return m
  }, [serials])

  const [expandedStage, setExpandedStage] = React.useState<ItemStage | null>(null)
  const [lotFilter, setLotFilter] = React.useState<string | null>(null)

  return (
    <Card className="border border-border shadow-sm overflow-hidden">
      <CardHeader className="border-b border-border bg-muted/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <Hash className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-bold">Pieces by Stage</CardTitle>
          {serials && serials.total > 0 && (
            <span className="ml-auto rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold">
              {serials.total} piece{serials.total === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {/* Pipeline arrow strip */}
        <div className="flex gap-2 overflow-x-auto p-1">
          {stages.map((stage, idx) => {
            const meta = STAGE_META[stage]
            const pieces = stageMap.get(stage) ?? []
            const count = pieces.length
            const isActive = count > 0
            const isExpanded = expandedStage === stage
            return (
              <button
                key={stage}
                type="button"
                onClick={() => { setExpandedStage(isExpanded ? null : stage); setLotFilter(null) }}
                className={`relative flex-1 min-w-[80px] rounded-lg border px-2 py-1.5 text-center transition-all cursor-pointer ${
                  isExpanded
                    ? `${meta.bg} ring-2 ring-offset-1 ring-current ${meta.tone}`
                    : isActive
                      ? `${meta.bg} ${meta.tone} hover:ring-1 hover:ring-current`
                      : "bg-muted/30 border-border text-muted-foreground/50"
                }`}
              >
                {idx < stages.length - 1 && (
                  <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 z-10 text-border">
                    <ChevronRight className="h-3 w-3" />
                  </div>
                )}
                <div className="text-[9px] uppercase tracking-wider font-bold truncate">{meta.label}</div>
                <div className={`text-lg font-extrabold font-mono ${isActive ? "" : "opacity-40"}`}>
                  {count}
                </div>
              </button>
            )
          })}
        </div>

        {/* Expanded serial list for selected stage */}
        {expandedStage && (stageMap.get(expandedStage) ?? []).length > 0 && (() => {
          const allPieces = stageMap.get(expandedStage) ?? []
          const lots = Array.from(new Set(allPieces.map((s) => s.lotNo ?? "—")))
          const filtered = lotFilter ? allPieces.filter((s) => (s.lotNo ?? "—") === lotFilter) : allPieces
          return (
            <div className="mt-3 border border-border rounded-lg overflow-hidden">
              <div className={`px-3 py-2 text-xs font-bold flex items-center gap-2 ${STAGE_META[expandedStage].bg} ${STAGE_META[expandedStage].tone}`}>
                <Hash className="h-3 w-3" />
                {STAGE_META[expandedStage].label} — {filtered.length} of {allPieces.length} piece{allPieces.length === 1 ? "" : "s"}
              </div>
              {/* Lot filter dropdown */}
              {lots.length > 1 && (
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/5">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground shrink-0">Filter by Lot</label>
                  <select
                    value={lotFilter ?? ""}
                    onChange={(e) => setLotFilter(e.target.value || null)}
                    className="text-xs font-mono bg-background border border-border rounded-md px-2 py-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary max-w-[280px]"
                  >
                    <option value="">All lots ({allPieces.length})</option>
                    {lots.map((lot) => {
                      const count = allPieces.filter((s) => (s.lotNo ?? "—") === lot).length
                      return <option key={lot} value={lot}>{lot} ({count})</option>
                    })}
                  </select>
                  {lotFilter && (
                    <button
                      type="button"
                      onClick={() => setLotFilter(null)}
                      className="text-[10px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      clear
                    </button>
                  )}
                </div>
              )}
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="text-[9px] uppercase bg-muted/40 text-muted-foreground border-b border-border sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-bold">Serial #</th>
                      <th className="px-2 py-1.5 text-left font-bold">Lot</th>
                      <th className="px-2 py-1.5 text-left font-bold">Notes</th>
                      <th className="px-2 py-1.5 text-right font-bold whitespace-nowrap">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((s) => (
                      <tr key={s.id} className="hover:bg-muted/10">
                        <td className="px-2 py-1.5 font-mono font-bold text-primary whitespace-nowrap">{s.serialNo}</td>
                        <td className="px-2 py-1.5 font-mono text-muted-foreground whitespace-nowrap">{s.lotNo || "—"}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{s.notes || "—"}</td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground whitespace-nowrap">
                          {new Date(s.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}

        {/* Empty state */}
        {(!serials || serials.total === 0) && (
          <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-3 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              No pieces tracked yet. Serial numbers will be assigned when stock is received or production starts.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SectionCard({ icon: Icon, title, children, dense }: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
  dense?: boolean
}) {
  return (
    <Card className="border border-border shadow-sm overflow-hidden">
      <CardHeader className="border-b border-border bg-muted/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-bold">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className={dense ? "p-3" : "p-5"}>{children}</CardContent>
    </Card>
  )
}

function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1 border-b border-border/50 last:border-0">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className={`text-sm text-right ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  )
}

// ── Used-in tree (right sidebar) ────────────────────────────────────────────

const USED_IN_TYPE_ICON: Record<ItemType, React.ComponentType<{ className?: string }>> = {
  raw: Nut,
  sub_assembly: Cpu,
  finished_product: Package,
  consumable: Boxes,
  asset: Laptop,
  packaging: Wrench,
}

/** Nested "where used" list. Roots are the direct parents of the item (edges
 *  with depth = 1); every parent then recursively drops its own parents
 *  underneath, until the server-side walk (default 6 levels) runs out. */
function UsedInTreeCard({ rootId, rootCode, rootName, edges }: {
  rootId: string; rootCode: string; rootName: string; edges: UsedInEdge[]
}) {
  const directParents = React.useMemo(() => edges.filter((e) => e.childId === rootId), [edges, rootId])
  const totalParents = React.useMemo(() => new Set(edges.map((e) => e.parentId)).size, [edges])
  const truncated = edges.length > 0 && edges.every((e) => e.depth < 6) === false && edges.some((e) => e.depth === 6)
  return (
    <Card className="border border-border shadow-sm overflow-hidden">
      <CardHeader className="border-b border-border bg-muted/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <ListTree className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-bold">Used in</CardTitle>
          {totalParents > 0 && (
            <span className="ml-auto rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold">
              {totalParents} parent{totalParents === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {directParents.length === 0 ? (
          <div className="text-xs text-muted-foreground italic">
            Not referenced by any assembly&apos;s active or draft BOM yet.
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-start gap-2">
              <div className="mt-0.5 h-6 w-6 shrink-0 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                <ChevronDown className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">This item</div>
                <div className="text-sm font-bold font-mono truncate" title={rootName}>{rootCode}</div>
              </div>
            </div>
            <ul className="space-y-1.5">
              {directParents.map((e) => (
                <UsedInNode key={`${e.parentId}-${e.childId}`} edge={e} edges={edges} />
              ))}
            </ul>
            {truncated && (
              <div className="mt-3 text-[11px] italic text-muted-foreground">
                Deeper parents may exist beyond the 6-level walk.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function UsedInNode({ edge, edges }: { edge: UsedInEdge; edges: UsedInEdge[] }) {
  const Icon = USED_IN_TYPE_ICON[edge.parentItemType] ?? Layers
  const children = React.useMemo(
    () => edges.filter((e) => e.childId === edge.parentId),
    [edge.parentId, edges],
  )
  return (
    <li>
      <div className="flex items-start gap-2 rounded-md hover:bg-muted/30 -mx-1 px-1 py-0.5">
        <div className="mt-0.5 h-6 w-6 shrink-0 rounded-md bg-muted/60 text-muted-foreground flex items-center justify-center">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <Link
            href={`/items/details/${encodeURIComponent(edge.parentId)}`}
            className="text-xs font-bold font-mono text-primary hover:underline block truncate"
            title={edge.parentName}
          >
            {edge.parentCode}
          </Link>
          <div className="text-[11px] text-muted-foreground truncate" title={edge.parentName}>{edge.parentName}</div>
        </div>
      </div>
      {children.length > 0 && (
        <ul className="ml-3 mt-1 border-l border-border pl-3 space-y-1.5">
          {children.map((c) => (
            <UsedInNode key={`${c.parentId}-${c.childId}`} edge={c} edges={edges} />
          ))}
        </ul>
      )}
    </li>
  )
}

function DetailSkeleton() {
  return (
    <div className="pb-12 space-y-6">
      <div className="flex gap-3">
        <Skeleton className="h-14 w-14 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
      </div>
      <Skeleton className="h-28" />
      <Skeleton className="h-64" />
    </div>
  )
}
