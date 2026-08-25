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
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ArrowLeft, Nut, Cpu, Package, Boxes, Wrench, Laptop, Factory,
  Pencil, Trash2, AlertCircle, AlertTriangle, CheckCircle2, Info,
  ShoppingBag, Sliders, Layers, GitBranch, PackagePlus, History,
} from "lucide-react"
import { extractError } from "@/lib/api-error"

// ── shapes (mirror src/lib/server/data/items.ts ItemView) ─────────────────
type ItemType = "raw" | "semi_assembled" | "assembled" | "consumable" | "asset" | "packaging"
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
  id: string; type: string; qtyDelta: number; variantId: string
  brandSlug: string | null; partNo: string | null
  warehouseCode: string | null; locationCode: string | null
  lotNo: string | null; supplierName: string | null
  refType: string | null; reason: string | null; createdAt: string
}

interface ItemBom {
  itemId: string
  versions: { id: string; version: string; status: string; effectiveFrom: string | null; effectiveTo: string | null; lineCount: number }[]
  selectedVersionId: string | null
  lines: {
    id: string; childItemId: string; childCode: string; childName: string; childItemType: ItemType
    qty: number; refDes: string | null; preferredBrandSlug: string | null; sequence: number | null; remarks: string | null
    childHasBom: boolean
  }[]
}

const TYPE_META: Record<ItemType, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  raw:            { label: "Raw",             icon: Nut,     tone: "bg-primary/10 text-primary border-primary/20" },
  semi_assembled: { label: "Semi-assembled",  icon: Cpu,     tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20" },
  assembled:      { label: "Assembled",       icon: Package, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  consumable:     { label: "Consumable",      icon: Boxes,   tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  asset:          { label: "Asset",           icon: Laptop,  tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20" },
  packaging:      { label: "Packaging",       icon: Wrench,  tone: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
}
const STATUS_TONE: Record<ItemStatus, string> = {
  active:       "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  inactive:     "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20",
  discontinued: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
}
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

  const [item, setItem] = React.useState<Item | null>(null)
  const [stock, setStock] = React.useState<StockRollup | null>(null)
  const [pcbUsage, setPcbUsage] = React.useState<PcbUsage[]>([])
  const [bom, setBom] = React.useState<ItemBom | null>(null)
  const [ledger, setLedger] = React.useState<LedgerRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [toast, setToast] = React.useState<{ message: string; hint?: string; type: "success" | "error" | "info" } | null>(null)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  const showToast = React.useCallback((info: { message: string; hint?: string; type: "success" | "error" | "info" }) => {
    setToast(info); window.setTimeout(() => setToast(null), info.type === "error" ? 6000 : 3000)
  }, [])

  const load = React.useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [itemRes, stockRes, usageRes, bomRes, ledgerRes] = await Promise.all([
        fetch(`/api/items/${encodeURIComponent(id)}`, { cache: "no-store" }),
        fetch(`/api/items/${encodeURIComponent(id)}/stock`, { cache: "no-store" }),
        fetch(`/api/items/${encodeURIComponent(id)}/pcb-usage`, { cache: "no-store" }),
        fetch(`/api/items/${encodeURIComponent(id)}/bom`, { cache: "no-store" }),
        fetch(`/api/items/${encodeURIComponent(id)}/ledger`, { cache: "no-store" }),
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
      window.setTimeout(() => router.push("/items/list"), 700)
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
          <Link href="/items/list" className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold hover:bg-muted/30">
            <ArrowLeft className="h-4 w-4" /> Back to Items
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
    <div className="max-w-6xl mx-auto pb-12 space-y-6">
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
            <Link href="/items/list" className="hover:text-foreground transition-colors">Items</Link>
            <span>/</span>
            <span className="text-foreground font-semibold truncate">{item.name}</span>
          </div>
          <div className="flex items-start gap-3">
            <div className={`h-14 w-14 shrink-0 flex items-center justify-center rounded-2xl ${typeMeta.tone}`}>
              <typeMeta.icon className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground truncate">{item.name}</h1>
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
          <Link href="/items/list" className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold hover:bg-muted/30">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          {item.variants.length > 0 && !manufactured && (
            <Link href="/components/inventory" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold hover:bg-muted/30"
              title="Stock In / Out is done from the Inventory screen">
              <PackagePlus className="h-4 w-4" /> Stock actions
            </Link>
          )}
          <Button variant="outline" onClick={() => router.push(`/items/edit/${item.id}`)} className="gap-1.5">
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

      {/* KPI strip — inventory rollup (only shown when stock endpoint returned something) */}
      {stock && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "On hand",   value: stock.onHand.toLocaleString(),  tone: "text-primary" },
            { label: "Available", value: stock.available.toLocaleString(), tone: "text-emerald-600 dark:text-emerald-400" },
            { label: "Reserved",  value: stock.reserved.toLocaleString(),  tone: "text-amber-600 dark:text-amber-400" },
            { label: "Damaged",   value: stock.damaged.toLocaleString(),   tone: "text-destructive" },
          ].map((k) => (
            <Card key={k.label} className="border border-border shadow-xs">
              <CardContent className="p-3.5">
                <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{k.label}</div>
                <div className={`mt-1 text-2xl font-extrabold ${k.tone} font-mono`}>{k.value}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{item.baseUom}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Grid: main sections left, side panel right */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <div className="space-y-6 min-w-0">
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

          {/* Bill of Materials — visible for every non-raw item.
              With versions:  full render + prominent "Edit BOM" button.
              Without one:    "No BOM yet" empty state with a "Create BOM" CTA.
              Raw items skip the section entirely (raw = foundational, no BOM). */}
          {item.itemType !== "raw" && (!bom || bom.versions.length === 0) && (
            <SectionCard icon={Layers} title="Bill of Materials">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground flex-1 min-w-[200px]">
                  No BOM defined yet. Create the first version to list the child items that make up this {TYPE_META[item.itemType].label.toLowerCase()}.
                </p>
                <Link
                  href={`/items/${encodeURIComponent(id)}/bom`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-bold hover:opacity-90"
                >
                  <Pencil className="h-3.5 w-3.5" /> Create BOM
                </Link>
              </div>
            </SectionCard>
          )}
          {bom && bom.versions.length > 0 && (() => {
            const active = bom.versions.find((v) => v.id === bom.selectedVersionId)
            return (
              <SectionCard icon={Layers} title="Bill of Materials">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/items/${encodeURIComponent(id)}/bom`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold hover:opacity-90"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit BOM
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 text-xs ml-2">
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
                    </div>
                    <span className="ml-auto text-xs text-muted-foreground font-mono">{bom.lines.length} line{bom.lines.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="text-[10px] uppercase bg-muted/40 text-muted-foreground border-b border-border">
                        <tr>
                          <th className="px-4 py-2 text-left font-bold">Child item</th>
                          <th className="px-4 py-2 text-left font-bold w-28">Ref des</th>
                          <th className="px-4 py-2 text-right font-bold w-20">Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {bom.lines.map((l) => {
                          const cMeta = TYPE_META[l.childItemType]
                          return (
                            <tr key={l.id} className="hover:bg-muted/10">
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-2">
                                  <cMeta.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <Link href={`/items/details/${l.childItemId}`} className="min-w-0">
                                    <span className="font-semibold text-primary hover:underline">{l.childName}</span>
                                    <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{l.childCode}</span>
                                  </Link>
                                  {l.childHasBom && (
                                    <span className="text-[9px] font-bold uppercase rounded border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 px-1 py-0.5" title="This child is a sub-assembly with its own BOM">
                                      sub-BOM
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{l.refDes ?? "—"}</td>
                              <td className="px-4 py-2 text-right font-mono font-semibold">{l.qty.toLocaleString()}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </SectionCard>
            )
          })()}

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

          {/* Movement history (F5.7+) — the ledger for this item across variants */}
          {ledger.length > 0 && (
            <SectionCard icon={History} title={`Movement history (${ledger.length})`}>
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[10px] uppercase bg-muted/40 text-muted-foreground border-b border-border sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-bold w-36">When</th>
                        <th className="px-3 py-2 text-left font-bold w-28">Type</th>
                        <th className="px-3 py-2 text-right font-bold w-20">Qty</th>
                        <th className="px-3 py-2 text-left font-bold">Location</th>
                        <th className="px-3 py-2 text-left font-bold">Lot / ref</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {ledger.map((m) => {
                        const inbound = m.qtyDelta > 0
                        const typeTone =
                          m.type === "IN" || m.type === "PRODUCTION" || m.type === "RETURN" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                          : m.type === "OUT" || m.type === "CONSUMPTION" ? "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20"
                          : m.type === "TRANSFER" ? "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                        return (
                          <tr key={m.id} className="hover:bg-muted/10">
                            <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(m.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold border ${typeTone}`}>{m.type}</span>
                            </td>
                            <td className={`px-3 py-2 text-right font-mono font-semibold ${inbound ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                              {inbound ? "+" : ""}{m.qtyDelta.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {m.warehouseCode ? `${m.warehouseCode}${m.locationCode ? ` · ${m.locationCode}` : ""}` : "—"}
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {m.lotNo && <span className="font-mono text-muted-foreground">{m.lotNo}</span>}
                              {m.supplierName && <span className="text-muted-foreground"> · {m.supplierName}</span>}
                              {!m.lotNo && (m.reason || m.refType) && <span className="text-muted-foreground italic">{m.reason ?? m.refType}</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </SectionCard>
          )}
        </div>

        {/* Right side: inventory breakdown */}
        <aside className="space-y-4">
          {stock && stock.byWarehouse.length > 0 && (
            <SectionCard icon={Boxes} title="Stock by warehouse" dense>
              <ul className="text-sm divide-y divide-border">
                {stock.byWarehouse.map((w) => (
                  <li key={w.warehouseId} className="flex items-center justify-between py-1.5">
                    <span className="font-semibold">{w.code}</span>
                    <span className="font-mono">{w.onHand.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
          {stock && stock.byLot.length > 0 && (
            <SectionCard icon={Layers} title="Lots (FEFO)" dense>
              <div className="max-h-96 overflow-y-auto">
                <ul className="divide-y divide-border">
                  {stock.byLot.map((l, i) => (
                    <li key={i} className="py-2 space-y-1">
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
            </SectionCard>
          )}
          {stock && stock.onHand === 0 && (
            <SectionCard icon={Info} title="Inventory" dense>
              <p className="text-xs text-muted-foreground">
                No stock on hand yet. {item.itemType === "assembled" || item.itemType === "semi_assembled"
                  ? "Post a production run to project into the ledger."
                  : "Receive a PO or add an opening quantity to start tracking."}
              </p>
            </SectionCard>
          )}
        </aside>
      </div>
    </div>
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

function DetailSkeleton() {
  return (
    <div className="max-w-6xl mx-auto pb-12 space-y-6">
      <div className="flex gap-3">
        <Skeleton className="h-14 w-14 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}
