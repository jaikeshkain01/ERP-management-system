"use client"

/**
 * Universal BOM editor (F6.4 / Slice B1).
 *
 * One editor page for every manufactured item's BOM. Reads via
 * `GET /api/items/[id]/bom`; writes via `POST /api/items/[id]/bom`
 * (create Draft), `PATCH /api/items/[id]/bom/[versionId]` (whole-version
 * replace of lines), `POST .../activate`, `DELETE .../[versionId]`.
 *
 * Version model:
 *   • Draft     — the only editable status. Lines are freely mutable.
 *   • Active    — read-only; a "New revision" button copies its lines
 *                 into a fresh Draft. At most one per parent (partial
 *                 unique index enforces this in the DB).
 *   • Superseded / Obsolete — read-only historical snapshots.
 *
 * Raw items have no BOM by definition — the page shows an empty state.
 * Legacy /pcb-management/structure + /products/structure still write to
 * pcb_lines / product_pcbs and stay live during the B2 dual-write phase.
 */

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ArrowLeft, Plus, Trash2, Layers, GitBranch, CheckCircle2, AlertCircle,
  Cpu, Nut, Package, Boxes, Wrench, Laptop, Save, Undo2, Copy,
} from "lucide-react"
import { extractError } from "@/lib/api-error"

// ── shapes (mirror src/lib/server/data/items.ts) ─────────────────────────────
type ItemType = "raw" | "semi_assembled" | "assembled" | "consumable" | "asset" | "packaging"
type BomStatus = "Draft" | "Active" | "Superseded" | "Obsolete"

interface ParentItem {
  id: string; code: string; name: string; itemType: ItemType
  baseUom: string
}
interface Variant {
  id: string; brandId: string | null; brandSlug: string | null; partNo: string | null
  sourceKind: "purchased" | "manufactured"
}
interface Version {
  id: string; version: string; status: string
  effectiveFrom: string | null; effectiveTo: string | null; lineCount: number
}
interface Line {
  id: string; childItemId: string; childCode: string; childName: string
  childItemType: ItemType; qty: number; refDes: string | null
  preferredBrandSlug: string | null; sequence: number | null; remarks: string | null
  childHasBom: boolean
}
interface Bom { itemId: string; versions: Version[]; selectedVersionId: string | null; lines: Line[] }

// Local editing shape — new/edited rows share this. `id` is undefined for
// unsaved additions; server assigns one on PATCH.
interface DraftLine {
  key: string                    // stable local key for React
  id?: string                    // server id if the line already exists
  childItemId: string
  childCode: string              // captured at pick time so the picker can close
  childName: string
  childItemType: ItemType
  qty: string                    // strings so inputs stay controlled
  refDes: string
  preferredBrandId: string       // '' = no preferred brand
  preferredBrandSlug: string | null
  sequence: string
  remarks: string
}

const TYPE_META: Record<ItemType, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  raw:            { icon: Nut,     label: "Raw" },
  semi_assembled: { icon: Cpu,     label: "Sub-assembly" },
  assembled:      { icon: Package, label: "Assembled" },
  consumable:     { icon: Boxes,   label: "Consumable" },
  asset:          { icon: Laptop,  label: "Asset" },
  packaging:      { icon: Wrench,  label: "Packaging" },
}

function toDraft(l: Line): DraftLine {
  return {
    key: l.id,
    id: l.id,
    childItemId: l.childItemId,
    childCode: l.childCode,
    childName: l.childName,
    childItemType: l.childItemType,
    qty: String(l.qty),
    refDes: l.refDes ?? "",
    preferredBrandId: "",
    preferredBrandSlug: l.preferredBrandSlug,
    sequence: l.sequence == null ? "" : String(l.sequence),
    remarks: l.remarks ?? "",
  }
}

// ── page ─────────────────────────────────────────────────────────────────────
export default function ItemBomEditorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [parent, setParent] = React.useState<ParentItem | null>(null)
  const [bom, setBom] = React.useState<Bom | null>(null)
  const [selectedVersionId, setSelectedVersionId] = React.useState<string | null>(null)
  const [draftLines, setDraftLines] = React.useState<DraftLine[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [busy, setBusy] = React.useState(false)  // create-version / activate / delete
  const [toast, setToast] = React.useState<{ type: "error" | "success" | "info"; message: string; hint?: string } | null>(null)
  const showToast = (t: typeof toast) => { setToast(t); window.setTimeout(() => setToast(null), t?.type === "error" ? 6000 : 3000) }

  // Per-child variants cache — populated lazily when a child is picked so its
  // preferred-brand dropdown can show real options.
  const [variantsByChild, setVariantsByChild] = React.useState<Record<string, Variant[]>>({})

  const selectedVersion = React.useMemo(
    () => bom?.versions.find((v) => v.id === selectedVersionId) ?? null,
    [bom, selectedVersionId],
  )
  const isEditable = selectedVersion?.status === "Draft"
  const isRaw = parent?.itemType === "raw"

  // ── load ──────────────────────────────────────────────────────────────────
  const reload = React.useCallback(async (versionIdHint?: string | null) => {
    setLoading(true)
    try {
      const [itemRes, bomRes] = await Promise.all([
        fetch(`/api/items/${encodeURIComponent(id)}`, { cache: "no-store" }),
        fetch(
          `/api/items/${encodeURIComponent(id)}/bom${versionIdHint ? `?version=${versionIdHint}` : ""}`,
          { cache: "no-store" },
        ),
      ])
      if (itemRes.ok) {
        const b = await itemRes.json() as { data: ParentItem }
        setParent(b.data)
      } else {
        const eb = await itemRes.json().catch(() => null)
        showToast({ ...extractError(eb, "Failed to load item"), type: "error" })
        setLoading(false); return
      }
      if (bomRes.ok) {
        const bb = await bomRes.json() as { data: Bom }
        setBom(bb.data)
        setSelectedVersionId(versionIdHint ?? bb.data.selectedVersionId)
        setDraftLines(bb.data.lines.map(toDraft))
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => { void reload() }, [reload])

  // Reset the local draft when the user switches versions.
  const switchVersion = async (vid: string) => {
    setSelectedVersionId(vid)
    // Refetch lines for the picked version.
    const res = await fetch(`/api/items/${encodeURIComponent(id)}/bom?version=${vid}`, { cache: "no-store" })
    if (res.ok) {
      const bb = await res.json() as { data: Bom }
      setBom(bb.data)
      setDraftLines(bb.data.lines.map(toDraft))
    }
  }

  // ── child picker (typeahead) ──────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = React.useState<string | null>(null) // draft key
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<ParentItem[]>([])
  const [searching, setSearching] = React.useState(false)

  React.useEffect(() => {
    if (!pickerOpen) return
    const q = query.trim()
    let cancelled = false
    setSearching(true)
    const t = window.setTimeout(async () => {
      const url = `/api/items?${new URLSearchParams(q ? { q } : {}).toString()}`
      const res = await fetch(url, { cache: "no-store" })
      if (cancelled) return
      if (res.ok) {
        const b = await res.json() as { data: ParentItem[] }
        // Filter out the parent itself (self-loop guard mirrored client-side).
        setResults(b.data.filter((r) => r.id !== id))
      }
      setSearching(false)
    }, 200)
    return () => { cancelled = true; window.clearTimeout(t) }
  }, [query, pickerOpen, id])

  const loadVariantsForChild = React.useCallback(async (childId: string) => {
    if (variantsByChild[childId]) return
    const res = await fetch(`/api/items/${encodeURIComponent(childId)}`, { cache: "no-store" })
    if (res.ok) {
      const b = await res.json() as { data: { variants: Variant[] } }
      setVariantsByChild((prev) => ({ ...prev, [childId]: b.data.variants }))
    }
  }, [variantsByChild])

  const pickChild = (draftKey: string, picked: ParentItem) => {
    setDraftLines((prev) => prev.map((d) =>
      d.key === draftKey
        ? { ...d, childItemId: picked.id, childCode: picked.code, childName: picked.name, childItemType: picked.itemType }
        : d
    ))
    void loadVariantsForChild(picked.id)
    setPickerOpen(null)
    setQuery("")
  }

  // ── line mutations ────────────────────────────────────────────────────────
  const patchLine = (key: string, patch: Partial<DraftLine>) => {
    setDraftLines((prev) => prev.map((d) => d.key === key ? { ...d, ...patch } : d))
  }
  const addLine = () => {
    const key = `new-${crypto.randomUUID()}`
    setDraftLines((prev) => [...prev, {
      key, childItemId: "", childCode: "", childName: "", childItemType: "raw",
      qty: "1", refDes: "", preferredBrandId: "", preferredBrandSlug: null,
      sequence: "", remarks: "",
    }])
    setPickerOpen(key)
    setQuery("")
  }
  const removeLine = (key: string) => setDraftLines((prev) => prev.filter((d) => d.key !== key))

  // Dirty check — every field the server round-trips.
  const dirty = React.useMemo(() => {
    if (!bom) return false
    const serverLines = bom.lines
    if (draftLines.length !== serverLines.length) return true
    for (const d of draftLines) {
      const s = serverLines.find((x) => x.id === d.id)
      if (!s) return true
      if (s.childItemId !== d.childItemId) return true
      if (String(s.qty) !== d.qty) return true
      if ((s.refDes ?? "") !== d.refDes) return true
      if (s.sequence == null ? d.sequence !== "" : String(s.sequence) !== d.sequence) return true
      if ((s.remarks ?? "") !== d.remarks) return true
      // preferredBrandId only registers dirty when the user actively picks
      // one — the server round-trips slug (which we can't easily map back
      // without the variants cache), so a no-op reload keeps this clean.
      if (d.preferredBrandId) return true
    }
    return false
  }, [bom, draftLines])

  // ── save (whole-version replace) ──────────────────────────────────────────
  const save = async () => {
    if (!selectedVersionId) return
    // Validate before firing.
    for (const d of draftLines) {
      if (!d.childItemId) return showToast({ type: "error", message: "Pick a child item on every line" })
      const q = Number(d.qty)
      if (!Number.isFinite(q) || q <= 0) return showToast({ type: "error", message: `Qty on "${d.childName || d.childCode || "line"}" must be > 0` })
    }
    setSaving(true)
    try {
      const body = {
        lines: draftLines.map((d) => ({
          childItemId: d.childItemId,
          qty: Number(d.qty),
          refDes: d.refDes.trim() || null,
          preferredBrandId: d.preferredBrandId || null,
          sequence: d.sequence.trim() === "" ? null : Number.parseInt(d.sequence, 10),
          remarks: d.remarks.trim() || null,
        })),
      }
      const res = await fetch(`/api/items/${encodeURIComponent(id)}/bom/${selectedVersionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const eb = await res.json().catch(() => null)
      if (!res.ok) return showToast({ ...extractError(eb, "Failed to save BOM"), type: "error" })
      const fresh = eb?.data as Bom
      setBom(fresh)
      setDraftLines(fresh.lines.map(toDraft))
      showToast({ type: "success", message: `Saved ${fresh.lines.length} line${fresh.lines.length === 1 ? "" : "s"}` })
    } finally {
      setSaving(false)
    }
  }

  // ── version mutations ─────────────────────────────────────────────────────
  const createVersion = async (copyFrom: string | null) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(id)}/bom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copyLinesFromVersionId: copyFrom }),
      })
      const eb = await res.json().catch(() => null)
      if (!res.ok) return showToast({ ...extractError(eb, "Failed to create BOM version"), type: "error" })
      const fresh = eb?.data as Bom
      setBom(fresh)
      setSelectedVersionId(fresh.selectedVersionId)
      setDraftLines(fresh.lines.map(toDraft))
      showToast({ type: "success", message: copyFrom ? "New revision created from current version" : "First BOM version created" })
    } finally { setBusy(false) }
  }
  const activateVersion = async () => {
    if (!selectedVersionId) return
    if (dirty) return showToast({ type: "error", message: "Save your changes first — activate is separate from save" })
    setBusy(true)
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(id)}/bom/${selectedVersionId}/activate`, { method: "POST" })
      const eb = await res.json().catch(() => null)
      if (!res.ok) return showToast({ ...extractError(eb, "Failed to activate version"), type: "error" })
      const fresh = eb?.data as Bom
      setBom(fresh); setDraftLines(fresh.lines.map(toDraft))
      showToast({ type: "success", message: "Version activated" })
    } finally { setBusy(false) }
  }
  const deleteVersion = async () => {
    if (!selectedVersionId) return
    if (!window.confirm("Delete this Draft version and all its lines? Cannot be undone.")) return
    setBusy(true)
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(id)}/bom/${selectedVersionId}`, { method: "DELETE" })
      const eb = await res.json().catch(() => null)
      if (!res.ok) return showToast({ ...extractError(eb, "Failed to delete version"), type: "error" })
      const fresh = eb?.data as Bom
      setBom(fresh)
      setSelectedVersionId(fresh.selectedVersionId)
      setDraftLines(fresh.lines.map(toDraft))
      showToast({ type: "success", message: "Draft version deleted" })
    } finally { setBusy(false) }
  }

  // ── render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="p-6 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full" /></div>
  )
  if (!parent) return (
    <div className="p-6"><p className="text-sm text-muted-foreground">Item not found.</p></div>
  )

  const ParentIcon = TYPE_META[parent.itemType].icon
  const statusChip = (s: string) => {
    const tone =
      s === "Active"     ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" :
      s === "Draft"      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" :
      s === "Superseded" ? "bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20" :
      /* Obsolete */       "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20"
    return <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold border ${tone}`}>{s}</span>
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/items/details/${id}`)} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            <ParentIcon className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="text-lg font-bold text-foreground truncate flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" /> BOM · {parent.name}
              </div>
              <div className="text-xs text-muted-foreground font-mono">{parent.code} · {TYPE_META[parent.itemType].label} · base UOM {parent.baseUom}</div>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${
          toast.type === "error"   ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300" :
          toast.type === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" :
                                     "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
        }`}>
          <div className="flex items-center gap-2">
            {toast.type === "error" ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
            <span>{toast.message}</span>
          </div>
          {toast.hint && <div className="text-xs mt-1 opacity-80">{toast.hint}</div>}
        </div>
      )}

      {isRaw ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Raw items don&apos;t have a BOM</CardTitle>
            <CardDescription>
              A raw item is foundational — it&apos;s purchased or ingested, nothing goes into it.
              Change the item&apos;s stage on the edit form if this is actually a sub-assembly.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : !bom || bom.versions.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No BOM yet</CardTitle>
            <CardDescription>Create the first version to start listing the child items that make up this {TYPE_META[parent.itemType].label.toLowerCase()}.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => createVersion(null)} disabled={busy} className="gap-1.5">
              <Plus className="h-4 w-4" /> Create first version
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Version bar */}
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Version</label>
                <select
                  value={selectedVersionId ?? ""}
                  onChange={(e) => void switchVersion(e.target.value)}
                  className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3 text-sm font-mono"
                >
                  {bom.versions.map((v) => (
                    <option key={v.id} value={v.id}>{v.version} · {v.status} · {v.lineCount} line{v.lineCount === 1 ? "" : "s"}</option>
                  ))}
                </select>
                {selectedVersion && statusChip(selectedVersion.status)}
              </div>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => createVersion(selectedVersionId)} disabled={busy} className="gap-1.5">
                  <Copy className="h-3.5 w-3.5" /> New revision from this
                </Button>
                {isEditable && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => void activateVersion()} disabled={busy || dirty} className="gap-1.5" title={dirty ? "Save your changes first" : ""}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Activate
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void deleteVersion()} disabled={busy} className="gap-1.5 text-rose-600 hover:text-rose-700">
                      <Trash2 className="h-3.5 w-3.5" /> Delete draft
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Lines editor */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Lines</CardTitle>
                <CardDescription>
                  {isEditable
                    ? "Whole-version replace: add, edit or remove lines, then Save."
                    : `${selectedVersion?.status ?? ""} versions are read-only — click "New revision from this" to edit.`}
                </CardDescription>
              </div>
              {isEditable && (
                <Button size="sm" onClick={addLine} disabled={saving} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Add line
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {draftLines.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No lines yet. {isEditable && "Click \"Add line\" to start."}</p>
              ) : (
                <div className="border border-border rounded-lg overflow-x-auto">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead className="text-[10px] uppercase bg-muted/40 text-muted-foreground border-b border-border">
                      <tr>
                        <th className="px-3 py-2 text-left font-bold">Child item</th>
                        <th className="px-3 py-2 text-right font-bold w-24">Qty</th>
                        <th className="px-3 py-2 text-left font-bold w-40">Ref des</th>
                        <th className="px-3 py-2 text-left font-bold w-40">Preferred brand</th>
                        <th className="px-3 py-2 text-right font-bold w-20">Seq</th>
                        <th className="px-3 py-2 text-left font-bold">Remarks</th>
                        {isEditable && <th className="w-10" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {draftLines.map((d) => {
                        const cMeta = TYPE_META[d.childItemType]
                        const variants = d.childItemId ? (variantsByChild[d.childItemId] ?? []) : []
                        const isPickerOn = pickerOpen === d.key
                        return (
                          <tr key={d.key} className="hover:bg-muted/10 align-top">
                            <td className="px-3 py-2 relative">
                              {isEditable && isPickerOn ? (
                                <div className="space-y-1">
                                  <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by code or name…" className="h-8 text-sm" />
                                  <div className="absolute z-20 top-full left-2 right-2 mt-1 border border-border rounded-lg bg-background shadow-lg max-h-64 overflow-y-auto">
                                    {searching && <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>}
                                    {!searching && results.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No matches</div>}
                                    {results.map((r) => {
                                      const RIcon = TYPE_META[r.itemType].icon
                                      return (
                                        <button
                                          key={r.id}
                                          type="button"
                                          className="w-full text-left px-3 py-1.5 hover:bg-muted/40 cursor-pointer flex items-center gap-2"
                                          onClick={() => pickChild(d.key, r)}
                                        >
                                          <RIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                          <span className="font-semibold text-sm">{r.name}</span>
                                          <span className="font-mono text-[11px] text-muted-foreground">{r.code}</span>
                                          <span className="ml-auto text-[9px] font-bold uppercase text-muted-foreground/70">{TYPE_META[r.itemType].label}</span>
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              ) : d.childItemId ? (
                                <button
                                  type="button"
                                  disabled={!isEditable}
                                  onClick={() => { setPickerOpen(d.key); setQuery("") }}
                                  className="flex items-center gap-2 text-left"
                                  title={isEditable ? "Click to change" : ""}
                                >
                                  <cMeta.icon className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="font-semibold text-foreground">{d.childName}</span>
                                  <span className="font-mono text-[11px] text-muted-foreground">{d.childCode}</span>
                                </button>
                              ) : (
                                <button type="button" onClick={() => { setPickerOpen(d.key); setQuery("") }} className="text-xs text-primary hover:underline">
                                  Pick a child item…
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={d.qty}
                                onChange={(e) => patchLine(d.key, { qty: e.target.value })}
                                disabled={!isEditable}
                                inputMode="decimal"
                                className="h-8 text-sm text-right font-mono"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={d.refDes}
                                onChange={(e) => patchLine(d.key, { refDes: e.target.value })}
                                disabled={!isEditable}
                                placeholder="R1, R2, C3…"
                                className="h-8 text-sm font-mono"
                              />
                            </td>
                            <td className="px-3 py-2">
                              {variants.length > 0 ? (
                                <select
                                  value={d.preferredBrandId}
                                  onChange={(e) => patchLine(d.key, { preferredBrandId: e.target.value })}
                                  disabled={!isEditable}
                                  className="w-full h-8 text-sm rounded border border-border bg-background px-2"
                                >
                                  <option value="">{d.preferredBrandSlug ? `— ${d.preferredBrandSlug} (unchanged) —` : "— none —"}</option>
                                  {variants.filter((v) => v.brandId).map((v) => (
                                    <option key={v.id} value={v.brandId!}>{v.brandSlug}{v.partNo ? ` · ${v.partNo}` : ""}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">
                                  {d.preferredBrandSlug ?? (d.childItemId ? "no variants" : "—")}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={d.sequence}
                                onChange={(e) => patchLine(d.key, { sequence: e.target.value })}
                                disabled={!isEditable}
                                inputMode="numeric"
                                className="h-8 text-sm text-right font-mono"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={d.remarks}
                                onChange={(e) => patchLine(d.key, { remarks: e.target.value })}
                                disabled={!isEditable}
                                className="h-8 text-sm"
                              />
                            </td>
                            {isEditable && (
                              <td className="px-2 py-2">
                                <button
                                  type="button"
                                  onClick={() => removeLine(d.key)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-500/10"
                                  title="Remove line"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {isEditable && (
                <div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-border">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => bom && setDraftLines(bom.lines.map(toDraft))}
                    disabled={saving || !dirty}
                    className="gap-1.5"
                  >
                    <Undo2 className="h-3.5 w-3.5" /> Discard
                  </Button>
                  <Button size="sm" onClick={() => void save()} disabled={saving || !dirty} className="gap-1.5">
                    <Save className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-[11px] text-muted-foreground">
            Notes: legacy <Link href="/pcb-management/structure" className="underline">PCB structure</Link> and <Link href="/products/structure" className="underline">product structure</Link> pages still write to their own tables during the B2 dual-write phase. This universal editor writes to <span className="font-mono">item_bom_versions / item_bom_lines</span>.
          </p>
        </>
      )}
    </div>
  )
}
