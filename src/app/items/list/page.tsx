"use client"

/**
 * Universal Item Master (F4 read + F5.1 edit/delete for component-backed items).
 *
 * F4 introduced the read side (list + detail panel). F5.1 adds Edit / Delete
 * affordances for items whose source is `components` — raw / consumable /
 * asset / packaging. Product- (assembled) and PCB-revision- (semi_assembled)
 * backed items keep an unlocked-only pencil placeholder for now; the server
 * returns 400 + a hint pointing at the legacy screen. Full support ships in
 * a later slice.
 */
import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { DragScrollArea } from "@/components/ui/drag-scroll-area"
import { Boxes, Cpu, Package, Nut, Search, X, RefreshCw, AlertTriangle, Pencil, Trash2, Save, Check, AlertCircle, Info, ExternalLink } from "lucide-react"
import { extractError } from "@/lib/api-error"

type ItemType =
  | "raw"
  | "semi_assembled"
  | "assembled"
  | "consumable"
  | "asset"
  | "packaging"
type ItemStatus = "active" | "inactive" | "discontinued"

interface Variant {
  id: string
  itemId: string
  sourceKind: "purchased" | "manufactured"
  brandId: string | null
  brandSlug: string | null
  partNo: string | null
  isDefault: boolean
  status: ItemStatus
}

interface Item {
  id: string
  code: string
  name: string
  description: string | null
  categoryId: string | null
  categoryPath: string | null
  itemType: ItemType
  baseUom: string
  minStock: number
  reorderQty: number
  safetyStock: number
  leadTimeDays: number | null
  specs: unknown
  status: ItemStatus
  onHand: number             // F5.5 rollup
  lastMovementAt: string | null
  variants: Variant[]
}

// Colour + icon per item_type. Kept in one place so tags/filters stay in sync.
const TYPE_META: Record<ItemType, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  raw:            { label: "Raw",            icon: Nut,     tone: "bg-primary/10 text-primary border-primary/20" },
  semi_assembled: { label: "Sub-assembly",   icon: Cpu,     tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20" },
  assembled:      { label: "Finished good",  icon: Package, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  consumable:     { label: "Consumable",     icon: Boxes,   tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  asset:          { label: "Asset",          icon: Boxes,   tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20" },
  packaging:      { label: "Packaging",      icon: Boxes,   tone: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
}
const ALL_TYPES = Object.keys(TYPE_META) as ItemType[]

const STATUS_TONE: Record<ItemStatus, string> = {
  active:       "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  inactive:     "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20",
  discontinued: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
}

// Item types whose master row lives in `components` — these are the item_types
// that F5.1 knows how to edit. Anything else falls back to the legacy screen.
const COMPONENT_BACKED: ReadonlySet<ItemType> = new Set(["raw", "consumable", "asset", "packaging"])

interface Toast { message: string; hint?: string; type: "success" | "error" | "info" }

/** Local state for the detail-panel edit form. Nulls kept as empty strings so
 *  inputs stay controlled; converted back on submit. */
interface EditForm {
  code: string
  name: string
  description: string
  baseUom: string
  minStock: string
  reorderQty: string
  safetyStock: string
  leadTimeDays: string
  status: ItemStatus
}

function toForm(it: Item): EditForm {
  return {
    code: it.code,
    name: it.name,
    description: it.description ?? "",
    baseUom: it.baseUom,
    minStock: String(it.minStock),
    reorderQty: String(it.reorderQty),
    safetyStock: String(it.safetyStock),
    leadTimeDays: it.leadTimeDays == null ? "" : String(it.leadTimeDays),
    status: it.status,
  }
}

export default function UniversalItemListPage() {
  return (
    <React.Suspense fallback={null}>
      <UniversalItemList />
    </React.Suspense>
  )
}

function UniversalItemList() {
  // `?id=<uuid>` opens the detail panel for that item on load — used by the
  // dashboard tiles and by the post-add redirect from /items/add. If the id
  // is not present in the tenant's list (deleted, wrong workspace) it is
  // silently ignored.
  const searchParams = useSearchParams()
  const preselectId = searchParams.get("id")

  const [items, setItems] = React.useState<Item[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [q, setQ] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<ItemType | "all">("all")
  const [statusFilter, setStatusFilter] = React.useState<ItemStatus | "all">("all")
  const [selected, setSelected] = React.useState<Item | null>(null)
  const [editing, setEditing] = React.useState(false)
  const [form, setForm] = React.useState<EditForm | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [toast, setToast] = React.useState<Toast | null>(null)

  const showToast = React.useCallback((info: Toast) => {
    setToast(info)
    window.setTimeout(() => setToast(null), info.type === "error" ? 6000 : 3000)
  }, [])

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/items", { cache: "no-store" })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      // API envelope from src/lib/server/http.ts:ok() wraps payloads as { data }.
      const payload = (await res.json()) as { data: Item[] }
      setItems(payload.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load items")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

  // Once items land, honour `?id=` if it points at a row in the current list.
  // Only preselects on the first successful load — subsequent reloads don't
  // re-open the panel when the user has already closed it.
  const preselectedRef = React.useRef(false)
  React.useEffect(() => {
    if (preselectedRef.current || !preselectId || loading || items.length === 0) return
    const match = items.find((it) => it.id === preselectId)
    if (match) setSelected(match)
    preselectedRef.current = true
  }, [preselectId, loading, items])

  // Any time the selected item changes (e.g. after a refresh from a save),
  // reset the edit form + confirm state so we do not leak stale values.
  React.useEffect(() => {
    if (!selected) { setEditing(false); setConfirmingDelete(false); setForm(null); return }
    setForm(toForm(selected))
  }, [selected])

  /** Reload the list and re-select the same item id (so the detail panel
   *  shows the just-persisted row). Called after every mutation. */
  const reloadAndReselect = React.useCallback(async (id: string) => {
    setLoading(true)
    try {
      const res = await fetch("/api/items", { cache: "no-store" })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const payload = (await res.json()) as { data: Item[] }
      setItems(payload.data ?? [])
      const next = (payload.data ?? []).find((it) => it.id === id) ?? null
      setSelected(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reload")
    } finally {
      setLoading(false)
    }
  }, [])

  const saveEdits = async () => {
    if (!selected || !form) return
    setSaving(true)
    try {
      // Build the PATCH body from fields that actually changed. Sending
      // untouched values is harmless but noisier in the audit log.
      const patch: Record<string, unknown> = {}
      if (form.code !== selected.code) patch.code = form.code.trim()
      if (form.name !== selected.name) patch.name = form.name.trim()
      const nextDesc = form.description.trim() || null
      if (nextDesc !== selected.description) patch.description = nextDesc
      if (form.baseUom !== selected.baseUom) patch.baseUom = form.baseUom.trim()
      const nMin = Number(form.minStock)
      if (Number.isFinite(nMin) && nMin !== selected.minStock) patch.minStock = nMin
      const nReorder = Number(form.reorderQty)
      if (Number.isFinite(nReorder) && nReorder !== selected.reorderQty) patch.reorderQty = nReorder
      const nSafety = Number(form.safetyStock)
      if (Number.isFinite(nSafety) && nSafety !== selected.safetyStock) patch.safetyStock = nSafety
      const nLead = form.leadTimeDays.trim() === "" ? null : Number(form.leadTimeDays)
      if (nLead !== selected.leadTimeDays) patch.leadTimeDays = nLead
      if (form.status !== selected.status) patch.status = form.status

      if (Object.keys(patch).length === 0) {
        setEditing(false)
        showToast({ message: "No changes to save", type: "info" })
        return
      }

      const res = await fetch(`/api/items/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        showToast({ ...extractError(body, "Failed to save item"), type: "error" })
        return
      }
      setEditing(false)
      showToast({ message: `Saved ${selected.code}`, type: "success" })
      await reloadAndReselect(selected.id)
    } finally {
      setSaving(false)
    }
  }

  const deleteItem = async () => {
    if (!selected) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(selected.id)}`, { method: "DELETE" })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        showToast({ ...extractError(body, "Failed to delete item"), type: "error" })
        return
      }
      const removedCode = selected.code
      setSelected(null)
      setConfirmingDelete(false)
      showToast({ message: `Deleted ${removedCode}`, type: "success" })
      await load()
    } finally {
      setDeleting(false)
    }
  }

  const filtered = React.useMemo(() => {
    const query = q.trim().toLowerCase()
    return items.filter((it) => {
      if (typeFilter !== "all" && it.itemType !== typeFilter) return false
      if (statusFilter !== "all" && it.status !== statusFilter) return false
      if (query) {
        const hay = `${it.code} ${it.name} ${it.categoryPath ?? ""}`.toLowerCase()
        if (!hay.includes(query)) return false
      }
      return true
    })
  }, [items, q, typeFilter, statusFilter])

  // Counts per type — recomputed post-filter (except type filter itself, which
  // is what the chips are toggling — showing the pre-type count is the useful
  // signal so the user can see "if I switch to Finished, N items appear").
  const typeCounts = React.useMemo(() => {
    const base = items.filter((it) => {
      if (statusFilter !== "all" && it.status !== statusFilter) return false
      if (q.trim()) {
        const hay = `${it.code} ${it.name}`.toLowerCase()
        if (!hay.includes(q.trim().toLowerCase())) return false
      }
      return true
    })
    const counts: Record<ItemType | "all", number> = {
      all: base.length, raw: 0, semi_assembled: 0, assembled: 0,
      consumable: 0, asset: 0, packaging: 0,
    }
    for (const it of base) counts[it.itemType]++
    return counts
  }, [items, q, statusFilter])

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-muted-foreground flex items-center gap-2 font-medium">
            <span>Items</span><span>/</span>
            <span className="text-foreground font-semibold">Universal Items</span>
            <span className="ml-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400 tracking-wide">
              PREVIEW · F4
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Universal Item Master</h1>
          <p className="text-sm text-muted-foreground">
            One list for everything the company holds — raw parts, sub-assemblies (PCBs), finished products, and more. Read-only during transformation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="outline" className="gap-2 font-semibold" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Search + type chips + status filter */}
      <div className="bg-card border border-border p-5 rounded-xl space-y-4 shadow-2xs">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search code, name, or category…"
            className="pl-9 bg-background border-border h-10 text-sm rounded-lg focus-visible:ring-1 focus-visible:ring-primary"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground font-semibold">Type:</span>
          {(["all", ...ALL_TYPES] as (ItemType | "all")[]).map((t) => {
            const active = typeFilter === t
            const label = t === "all" ? "All" : TYPE_META[t].label
            const count = typeCounts[t]
            return (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1 text-xs rounded-full border transition-all cursor-pointer font-semibold select-none ${
                  active
                    ? "bg-primary/10 border-primary text-primary shadow-3xs"
                    : "bg-background border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {label} <span className="font-mono opacity-70">({count})</span>
              </button>
            )
          })}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-semibold">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ItemStatus | "all")}
              className="bg-background border border-border rounded-lg text-xs px-2 py-1 outline-none focus:ring-1 focus:ring-primary cursor-pointer text-foreground font-semibold"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="discontinued">Discontinued</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Failed to load items</p>
            <p className="text-xs opacity-80 font-mono">{error}</p>
          </div>
        </div>
      )}

      {/* Table */}
      <Card className="w-full border border-border shadow-2xs overflow-hidden bg-card">
        <CardHeader className="border-b border-border bg-muted/10 px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold text-foreground">Items</CardTitle>
              <CardDescription className="text-xs">Click a row to open its details panel</CardDescription>
            </div>
            <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground font-mono">
              {filtered.length} / {items.length}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DragScrollArea className="overflow-x-auto">
            <table className="w-full text-sm text-left text-foreground">
              <thead className="text-[10px] uppercase bg-muted/30 text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-6 py-3 font-semibold w-40">Code</th>
                  <th className="px-6 py-3 font-semibold">Name</th>
                  <th className="px-6 py-3 font-semibold w-40">Type</th>
                  <th className="px-6 py-3 font-semibold">Category</th>
                  <th className="px-6 py-3 font-semibold text-center w-24">Variants</th>
                  <th className="px-6 py-3 font-semibold text-right w-28">On hand</th>
                  <th className="px-6 py-3 font-semibold text-center w-16">UOM</th>
                  <th className="px-6 py-3 font-semibold text-right w-28">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-6 py-4"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))}
                {!loading && filtered.map((it) => {
                  const meta = TYPE_META[it.itemType]
                  const Icon = meta.icon
                  const isSelected = selected?.id === it.id
                  return (
                    <tr
                      key={it.id}
                      onClick={() => setSelected(it)}
                      className={`cursor-pointer transition-colors duration-150 ${
                        isSelected ? "bg-primary/5 hover:bg-primary/5" : "hover:bg-muted/30"
                      }`}
                    >
                      <td className="px-6 py-4 font-mono font-bold text-xs text-primary">{it.code}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className={`h-8 w-8 shrink-0 flex items-center justify-center rounded-lg ${isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <span className={`font-semibold ${isSelected ? "text-primary" : "text-foreground"}`}>{it.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${meta.tone}`}>
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground text-xs font-medium">{it.categoryPath ?? "—"}</td>
                      <td className="px-6 py-4 text-center font-mono font-semibold text-muted-foreground/80">{it.variants.length}</td>
                      <td className={`px-6 py-4 text-right font-mono font-semibold ${
                        it.onHand === 0
                          ? "text-muted-foreground/50"
                          : it.minStock > 0 && it.onHand < it.minStock
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-foreground"
                      }`} title={it.lastMovementAt ? `Last movement: ${new Date(it.lastMovementAt).toLocaleString()}` : "No movements yet"}>
                        {it.onHand.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-center font-mono text-xs text-muted-foreground">{it.baseUom}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${STATUS_TONE[it.status]}`}>
                          {it.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-14 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Search className="h-8 w-8 opacity-30" />
                        <span className="text-sm font-medium">No items match your search and filters</span>
                        {(typeFilter !== "all" || statusFilter !== "all" || q.trim()) && (
                          <button
                            onClick={() => { setTypeFilter("all"); setStatusFilter("all"); setQ("") }}
                            className="text-xs text-primary hover:underline font-semibold cursor-pointer mt-1"
                          >
                            Reset filters
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </DragScrollArea>
        </CardContent>
      </Card>

      {/* Toast (matches PcbRevisionsCard for consistency across the app) */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-[70] max-w-md flex items-start gap-2 px-4 py-3 rounded-lg border shadow-lg bg-background animate-in fade-in slide-in-from-bottom-5 ${
          toast.type === "success" ? "border-emerald-500/35 text-emerald-600 dark:text-emerald-400"
          : toast.type === "error" ? "border-destructive/35 text-destructive"
          : "border-primary/35 text-primary"
        }`}>
          {toast.type === "success"
            ? <Check className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
            : toast.type === "error"
            ? <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
            : <Info className="h-4 w-4 mt-0.5 shrink-0 text-primary" />}
          <div className="min-w-0">
            <div className="text-sm font-semibold">{toast.message}</div>
            {toast.hint && <div className="mt-1 text-xs font-medium text-muted-foreground">{toast.hint}</div>}
          </div>
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => { if (!editing && !confirmingDelete) setSelected(null) }}
          />
          <div
            className="fixed inset-y-0 right-0 z-50 w-full md:w-[36vw] bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-250"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border bg-muted/20 px-6 py-4 shrink-0">
              <div className="flex items-center gap-2">
                {(() => {
                  const Icon = TYPE_META[selected.itemType].icon
                  return <Icon className="h-5 w-5 text-primary" />
                })()}
                <h3 className="text-base font-extrabold text-foreground">
                  {editing ? "Edit Item" : "Item Details"}
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                {!editing && (() => {
                  const editable = COMPONENT_BACKED.has(selected.itemType)
                  return (
                    <>
                      {/* Full detail page — available for EVERY item type (the
                          detail page reads universally), unlike inline Edit. */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs cursor-pointer"
                        render={<Link href={`/items/details/${selected.id}`} />}
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> View full details
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs cursor-pointer"
                        disabled={!editable}
                        title={editable
                          ? undefined
                          : selected.itemType === "assembled"
                            ? "Product items are edited via Products → Product List for now"
                            : "PCB-revision items are edited via PCB Management → PCB Structure for now"}
                        onClick={() => setEditing(true)}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs text-destructive border-destructive/40 hover:bg-destructive/5 cursor-pointer"
                        disabled={!editable}
                        title={editable ? undefined : "Delete this item type from its legacy screen for now"}
                        onClick={() => setConfirmingDelete(true)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    </>
                  )
                })()}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full border-0 bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => { if (!saving && !deleting) { setEditing(false); setConfirmingDelete(false); setSelected(null) } }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Identity */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Item Name</span>
                {editing && form ? (
                  <Input
                    className="text-lg font-extrabold h-11"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                ) : (
                  <h4 className="text-xl font-extrabold text-foreground tracking-tight">{selected.name}</h4>
                )}
                <div className="flex flex-wrap items-center gap-1.5">
                  {editing && form ? (
                    <Input
                      className="w-40 h-7 text-xs font-mono font-black bg-primary/10 border-primary/30 text-primary"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                    />
                  ) : (
                    <span className="font-mono text-xs font-black bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded">
                      {selected.code}
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border ${TYPE_META[selected.itemType].tone}`}>
                    {TYPE_META[selected.itemType].label}
                  </span>
                  {editing && form ? (
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as ItemStatus })}
                      className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold border cursor-pointer outline-none focus:ring-1 focus:ring-primary ${STATUS_TONE[form.status]}`}
                    >
                      <option value="active">active</option>
                      <option value="inactive">inactive</option>
                      <option value="discontinued">discontinued</option>
                    </select>
                  ) : (
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border ${STATUS_TONE[selected.status]}`}>
                      {selected.status}
                    </span>
                  )}
                </div>
                {editing && form ? (
                  <textarea
                    className="w-full mt-2 min-h-16 text-sm text-muted-foreground bg-background border border-border rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
                    value={form.description}
                    placeholder="Description (optional)"
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                ) : (
                  selected.description && <p className="text-sm text-muted-foreground pt-2">{selected.description}</p>
                )}
              </div>

              {/* Master fields */}
              <div className="space-y-2">
                <h5 className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider">Master</h5>
                {editing && form ? (
                  <div className="border border-border rounded-lg overflow-hidden bg-muted/5 text-xs">
                    <table className="w-full text-left">
                      <tbody className="divide-y divide-border font-medium">
                        <EditRow label="Category" value={selected.categoryPath ?? "—"} readOnly note="Category picker lands in a later slice" />
                        <EditRow label="Base UOM">
                          <Input value={form.baseUom} onChange={(e) => setForm({ ...form, baseUom: e.target.value })} className="h-7 text-xs font-mono w-24 ml-auto" />
                        </EditRow>
                        <EditRow label="Min stock">
                          <Input type="number" step="any" min={0} value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} className="h-7 text-xs font-mono w-28 ml-auto" />
                        </EditRow>
                        <EditRow label="Reorder qty">
                          <Input type="number" step="any" min={0} value={form.reorderQty} onChange={(e) => setForm({ ...form, reorderQty: e.target.value })} className="h-7 text-xs font-mono w-28 ml-auto" />
                        </EditRow>
                        <EditRow label="Safety stock">
                          <Input type="number" step="any" min={0} value={form.safetyStock} onChange={(e) => setForm({ ...form, safetyStock: e.target.value })} className="h-7 text-xs font-mono w-28 ml-auto" />
                        </EditRow>
                        <EditRow label="Lead time (days)">
                          <Input type="number" step={1} min={0} value={form.leadTimeDays} onChange={(e) => setForm({ ...form, leadTimeDays: e.target.value })} placeholder="—" className="h-7 text-xs font-mono w-28 ml-auto" />
                        </EditRow>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden bg-muted/5 text-xs">
                    <table className="w-full text-left">
                      <tbody className="divide-y divide-border font-medium">
                        <Row label="Category"       value={selected.categoryPath ?? "—"} />
                        <Row label="Base UOM"       value={selected.baseUom} mono />
                        <Row label="Min stock"      value={selected.minStock.toLocaleString()} mono />
                        <Row label="Reorder qty"    value={selected.reorderQty.toLocaleString()} mono />
                        <Row label="Safety stock"   value={selected.safetyStock.toLocaleString()} mono />
                        <Row label="Lead time"      value={selected.leadTimeDays != null ? `${selected.leadTimeDays} d` : "—"} mono />
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {editing && (
                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => { setEditing(false); setForm(toForm(selected)) }} disabled={saving} className="cursor-pointer">
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => void saveEdits()} disabled={saving} className="gap-1.5 cursor-pointer">
                    <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              )}

              {confirmingDelete && !editing && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
                  <div className="flex items-start gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <p className="font-bold">Delete {selected.code}?</p>
                      <p className="text-xs mt-1 opacity-90">
                        This soft-deletes the item, its brand variants, and the underlying components row. It cannot be undone from the UI.
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setConfirmingDelete(false)} disabled={deleting} className="cursor-pointer">
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => void deleteItem()} disabled={deleting} className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer">
                      <Trash2 className="h-3.5 w-3.5" /> {deleting ? "Deleting…" : "Yes, delete"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Variants */}
              <div className="space-y-2 pb-6">
                <h5 className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider flex items-center justify-between">
                  <span>Variants</span>
                  <span className="font-mono text-muted-foreground/80">{selected.variants.length}</span>
                </h5>
                <div className="border border-border rounded-lg overflow-hidden bg-muted/5 text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-muted/40 text-muted-foreground text-[9px] uppercase border-b border-border">
                      <tr>
                        <th className="px-4 py-2 font-bold">Source</th>
                        <th className="px-4 py-2 font-bold">Brand</th>
                        <th className="px-4 py-2 font-bold">Part No</th>
                        <th className="px-4 py-2 font-bold text-right">Default</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-medium">
                      {selected.variants.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground italic">
                            No variants yet — item defined but not sourced or produced.
                          </td>
                        </tr>
                      )}
                      {selected.variants.map((v) => (
                        <tr key={v.id} className="hover:bg-muted/10">
                          <td className="px-4 py-2 font-mono text-[11px]">
                            <span className={`inline-flex rounded px-1.5 py-0.5 border font-bold ${
                              v.sourceKind === "manufactured"
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                                : "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20"
                            }`}>
                              {v.sourceKind}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{v.brandSlug ?? "—"}</td>
                          <td className="px-4 py-2 font-mono text-muted-foreground">{v.partNo ?? "—"}</td>
                          <td className="px-4 py-2 text-right">
                            {v.isDefault
                              ? <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                              : <span className="text-muted-foreground/40">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <tr className="hover:bg-muted/10">
      <td className="px-4 py-2 text-muted-foreground font-bold">{label}</td>
      <td className={`px-4 py-2 text-right ${mono ? "font-mono" : ""}`}>{value}</td>
    </tr>
  )
}

/** Edit-mode row: renders the input (children) on the right and the label
 *  on the left. `readOnly` shows a plain value with an optional footnote. */
function EditRow({
  label,
  value,
  readOnly,
  note,
  children,
}: {
  label: string
  value?: string
  readOnly?: boolean
  note?: string
  children?: React.ReactNode
}) {
  return (
    <tr>
      <td className="px-4 py-2 text-muted-foreground font-bold align-middle">
        {label}
        {note && <div className="text-[10px] font-medium text-muted-foreground/70 mt-0.5">{note}</div>}
      </td>
      <td className="px-4 py-2 text-right align-middle">
        {readOnly ? <span className="text-muted-foreground">{value}</span> : children}
      </td>
    </tr>
  )
}
