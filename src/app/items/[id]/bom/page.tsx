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
 * Post-D3, this is the only BOM editor in the app — the legacy PCB / product
 * structure pages have been retired and their tables dropped.
 */

import * as React from "react"
import { createPortal } from "react-dom"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { withFromParam } from "@/lib/modules"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ArrowLeft, Plus, Trash2, Layers, GitBranch, CheckCircle2, AlertCircle,
  Cpu, Nut, Package, Boxes, Wrench, Laptop, Save, Undo2, Copy,
  Link2, Sparkles, ListTree, Table2, ChevronRight, ChevronDown, Loader2,
} from "lucide-react"
import { extractError } from "@/lib/api-error"
import { DragScrollArea } from "@/components/ui/drag-scroll-area"

// ── shapes (mirror src/lib/server/data/items.ts) ─────────────────────────────
type ItemType = "raw" | "semi_assembled" | "assembled" | "consumable" | "asset" | "packaging"
type BomStatus = "Draft" | "Active" | "Superseded" | "Obsolete"

interface ParentItem {
  id: string; code: string; name: string; itemType: ItemType
  baseUom: string
  genericPn: string | null
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
  childGenericPn: string | null
  childItemType: ItemType; qty: number; refDes: string | null
  preferredBrandSlug: string | null; sequence: number | null; remarks: string | null
  childHasBom: boolean
}
interface Bom {
  itemId: string; versions: Version[]; selectedVersionId: string | null; lines: Line[]
}

// Local editing shape — new/edited rows share this. `id` is undefined for
// unsaved additions; server assigns one on PATCH. `childItemId` empty on an
// unsaved row means the user is CREATING a new catalog item inline —
// `childCode`, `childItemType`, `childGenericPn` describe that new item and
// are POSTed to /api/items on save (with minStock: 10, zero opening stock).
interface DraftLine {
  key: string                    // stable local key for React
  id?: string                    // server id if the line already exists
  childItemId: string
  childCode: string              // catalog code (readonly if linked) OR new item's code (editable, auto-suggested)
  childName: string
  childItemType: ItemType
  childGenericPn: string         // new-item PN; ignored when linked
  qty: string                    // strings so inputs stay controlled
  refDes: string
  preferredBrandId: string       // '' = no preferred brand
  preferredBrandSlug: string | null
  sequence: string
  remarks: string
}

// Auto-suggest a code from name + type — same shape as universal-item-form
// so users see consistent patterns whether they're on the add form or here.
function suggestCode(name: string, itemType: ItemType): string {
  const slug: Record<ItemType, string> = {
    raw: "RAW", semi_assembled: "SUB", assembled: "FG",
    consumable: "CON", asset: "AST", packaging: "PKG",
  }
  const namePart = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24)
  if (!namePart) return ""
  return `${slug[itemType]}-${namePart}`
}

const TYPE_META: Record<ItemType, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  raw:            { icon: Nut,     label: "Raw" },
  semi_assembled: { icon: Cpu,     label: "Semi-assembled" },
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
    childGenericPn: l.childGenericPn ?? "",
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
  const searchParams = useSearchParams()
  const fromId = searchParams.get("from")

  const [parent, setParent] = React.useState<ParentItem | null>(null)
  const [bom, setBom] = React.useState<Bom | null>(null)
  const [selectedVersionId, setSelectedVersionId] = React.useState<string | null>(null)
  const [draftLines, setDraftLines] = React.useState<DraftLine[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [busy, setBusy] = React.useState(false)  // create-version / activate / delete
  const [viewMode, setViewMode] = React.useState<"table" | "tree">("table")
  const [toast, setToast] = React.useState<{ type: "error" | "success" | "info"; message: string; hint?: string } | null>(null)
  const showToast = (t: typeof toast) => { setToast(t); window.setTimeout(() => setToast(null), t?.type === "error" ? 6000 : 3000) }

  // Per-child variants cache — populated lazily when a child is picked so its
  // preferred-brand dropdown can show real options.
  const [variantsByChild, setVariantsByChild] = React.useState<Record<string, Variant[]>>({})

  // Sub-BOM cache and expand set for the Tree view. Each entry is the child
  // item's Active BOM lines (recursive expansion re-uses this cache). We cap
  // recursion depth so a rogue self-referencing cycle can't blow the render.
  const MAX_TREE_DEPTH = 8
  const [subBomByChild, setSubBomByChild] = React.useState<Record<string, Line[]>>({})
  const [loadingSubBom, setLoadingSubBom] = React.useState<Set<string>>(new Set())
  const [expandedChildren, setExpandedChildren] = React.useState<Set<string>>(new Set())

  // "Does this child have any BOM version?" cache, keyed by childItemId.
  // The server flag on saved BOM lines is the source of truth, but freshly
  // added draft rows (or rows on an unsaved parent) don't have a server line
  // yet — so we check the child directly and cache the answer.
  const [childHasBomCache, setChildHasBomCache] = React.useState<Record<string, boolean>>({})

  const loadSubBom = React.useCallback(async (childItemId: string) => {
    if (!childItemId) return
    if (subBomByChild[childItemId] || loadingSubBom.has(childItemId)) return
    setLoadingSubBom((prev) => new Set(prev).add(childItemId))
    try {
      const res = await fetch(`/api/items/${encodeURIComponent(childItemId)}/bom`, { cache: "no-store" })
      if (res.ok) {
        const b = await res.json() as { data: Bom }
        setSubBomByChild((prev) => ({ ...prev, [childItemId]: b.data.lines }))
      }
    } finally {
      setLoadingSubBom((prev) => { const next = new Set(prev); next.delete(childItemId); return next })
    }
  }, [subBomByChild, loadingSubBom])

  const toggleExpand = React.useCallback((childItemId: string) => {
    if (!childItemId) return
    setExpandedChildren((prev) => {
      const next = new Set(prev)
      if (next.has(childItemId)) next.delete(childItemId)
      else { next.add(childItemId); void loadSubBom(childItemId) }
      return next
    })
  }, [loadSubBom])

  const collapseAll = React.useCallback(() => setExpandedChildren(new Set()), [])

  // Seed the has-BOM cache from server lines (source of truth), then lazy-fill
  // any linked child that we don't yet have an answer for by asking that
  // child's BOM endpoint. `versions.length > 0` means the child carries a BOM.
  React.useEffect(() => {
    if (!bom) return
    setChildHasBomCache((prev) => {
      let changed = false
      const next = { ...prev }
      for (const l of bom.lines) {
        if (l.childItemId && next[l.childItemId] === undefined) {
          next[l.childItemId] = l.childHasBom
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [bom])

  React.useEffect(() => {
    const linkedIds = new Set<string>()
    for (const d of draftLines) {
      if (!d.childItemId) continue
      if (childHasBomCache[d.childItemId] !== undefined) continue
      linkedIds.add(d.childItemId)
    }
    if (linkedIds.size === 0) return
    let cancelled = false
    ;(async () => {
      for (const cid of linkedIds) {
        const res = await fetch(`/api/items/${encodeURIComponent(cid)}/bom`, { cache: "no-store" })
        if (cancelled) return
        if (res.ok) {
          const b = await res.json() as { data: { versions: unknown[] } }
          setChildHasBomCache((prev) => ({ ...prev, [cid]: b.data.versions.length > 0 }))
        } else {
          // Cache a negative so we don't loop; a later reload after linking will refresh.
          setChildHasBomCache((prev) => ({ ...prev, [cid]: false }))
        }
      }
    })()
    return () => { cancelled = true }
  }, [draftLines, childHasBomCache])

  const selectedVersion = React.useMemo(
    () => bom?.versions.find((v) => v.id === selectedVersionId) ?? null,
    [bom, selectedVersionId],
  )
  const isEditable = selectedVersion?.status === "Draft"
  const isRaw = parent?.itemType === "raw"

  // Read-only versions default to the tree (assembly-style) view, editable
  // drafts default to the table so a Save is one click away. Runs when the
  // selected version's editability flips — not on every keystroke.
  React.useEffect(() => {
    if (selectedVersion) setViewMode(isEditable ? "table" : "tree")
  }, [isEditable, selectedVersion])

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

  // ── child picker (typeahead-in-row) ───────────────────────────────────────
  // Same UX as universal-item-form's BOM section: type in the Name field,
  // matches appear in a dropdown, click to link. A green Link2 icon marks
  // linked rows; sparkles marks rows that will be created as new items.
  //
  // The dropdown is portalled to <body> at a fixed position anchored to the
  // input's bounding rect. Without the portal it renders inside a <td> whose
  // enclosing scroll container (`overflow-x-auto`) clips it — the suggestions
  // ended up hidden under the next row. Reposition on scroll/resize keeps
  // the anchor tracking; escape/blur close it via existing handlers.
  const [openRow, setOpenRow] = React.useState<string | null>(null)
  const [matches, setMatches] = React.useState<Record<string, ParentItem[]>>({})
  const nameInputRefs = React.useRef<Map<string, HTMLInputElement | null>>(new Map())
  const setNameInputRef = React.useCallback((key: string, el: HTMLInputElement | null) => {
    if (el) nameInputRefs.current.set(key, el)
    else nameInputRefs.current.delete(key)
  }, [])
  const [anchorRect, setAnchorRect] = React.useState<{ x: number; y: number; w: number } | null>(null)
  React.useEffect(() => {
    if (!openRow) { setAnchorRect(null); return }
    const measure = () => {
      const el = nameInputRefs.current.get(openRow)
      if (!el) return
      const r = el.getBoundingClientRect()
      setAnchorRect({ x: r.left, y: r.bottom, w: r.width })
    }
    measure()
    window.addEventListener("scroll", measure, true)
    window.addEventListener("resize", measure)
    return () => {
      window.removeEventListener("scroll", measure, true)
      window.removeEventListener("resize", measure)
    }
  }, [openRow, matches])

  const loadVariantsForChild = React.useCallback(async (childId: string) => {
    if (variantsByChild[childId]) return
    const res = await fetch(`/api/items/${encodeURIComponent(childId)}`, { cache: "no-store" })
    if (res.ok) {
      const b = await res.json() as { data: { variants: Variant[] } }
      setVariantsByChild((prev) => ({ ...prev, [childId]: b.data.variants }))
    }
  }, [variantsByChild])

  // Debounced /api/items lookup per open row.
  React.useEffect(() => {
    if (!openRow) return
    const row = draftLines.find((l) => l.key === openRow)
    if (!row) return
    const q = row.childName.trim()
    if (!q) { setMatches((prev) => ({ ...prev, [openRow]: [] })); return }
    let cancelled = false
    const t = window.setTimeout(async () => {
      const res = await fetch(`/api/items?q=${encodeURIComponent(q)}`, { cache: "no-store" })
      if (cancelled) return
      if (res.ok) {
        const b = await res.json() as { data: ParentItem[] }
        // Filter out the parent itself (self-loop guard).
        setMatches((prev) => ({ ...prev, [openRow]: b.data.filter((r) => r.id !== id).slice(0, 8) }))
      }
    }, 180)
    return () => { cancelled = true; window.clearTimeout(t) }
  }, [openRow, draftLines, id])

  const pickChild = (draftKey: string, picked: ParentItem) => {
    setDraftLines((prev) => prev.map((d) =>
      d.key === draftKey
        ? {
            ...d,
            childItemId: picked.id,
            childCode: picked.code,
            childName: picked.name,
            childItemType: picked.itemType,
            childGenericPn: picked.genericPn ?? "",
          }
        : d
    ))
    void loadVariantsForChild(picked.id)
    setOpenRow(null)
  }

  // ── line mutations ────────────────────────────────────────────────────────
  const patchLine = (key: string, patch: Partial<DraftLine>) => {
    setDraftLines((prev) => prev.map((d) => d.key === key ? { ...d, ...patch } : d))
  }
  // Typing in Name: update text, clear any link, and auto-suggest a code
  // as long as the user hasn't hand-edited it away from a prior suggestion.
  const onNameChange = (key: string, value: string) => {
    setDraftLines((prev) => prev.map((d) => {
      if (d.key !== key) return d
      const priorSuggest = suggestCode(d.childName, d.childItemType)
      const codeIsAutoSuggested = !d.childCode || d.childCode === priorSuggest
      const nextCode = codeIsAutoSuggested && !d.id ? suggestCode(value, d.childItemType) : d.childCode
      return { ...d, childName: value, childItemId: "", childCode: nextCode, childItemType: d.childItemType }
    }))
    setOpenRow(value.trim() ? key : null)
  }
  const onTypeChange = (key: string, value: ItemType) => {
    setDraftLines((prev) => prev.map((d) => {
      if (d.key !== key) return d
      const priorSuggest = suggestCode(d.childName, d.childItemType)
      const codeIsAutoSuggested = !d.childCode || d.childCode === priorSuggest
      const nextCode = codeIsAutoSuggested ? suggestCode(d.childName, value) : d.childCode
      return { ...d, childItemType: value, childCode: nextCode }
    }))
  }
  const addLine = () => {
    const key = `new-${crypto.randomUUID()}`
    setDraftLines((prev) => [...prev, {
      key, childItemId: "", childCode: "", childName: "", childItemType: "raw", childGenericPn: "",
      qty: "1", refDes: "", preferredBrandId: "", preferredBrandSlug: null,
      sequence: "", remarks: "",
    }])
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

  // ── save (whole-version replace, with inline child creation) ──────────────
  const save = async () => {
    if (!selectedVersionId) return

    // Drop rows that are completely empty (no name AND no link) — they're
    // just draft placeholders. Everything else needs a valid qty + either
    // a link OR a name for the create-new-child path.
    const submittable = draftLines.filter((d) => d.childItemId || d.childName.trim())
    for (const d of submittable) {
      const q = Number(d.qty)
      if (!Number.isFinite(q) || q <= 0) {
        return showToast({ type: "error", message: `Qty on "${d.childName || d.childCode || "line"}" must be > 0` })
      }
    }

    setSaving(true)
    try {
      // Pre-create any unlinked rows via POST /api/items, capturing their
      // returned ids for the BOM PATCH. Failed creates surface in the toast
      // and their rows are dropped from the save; the rest still ships.
      const failed: string[] = []
      const resolved: (DraftLine & { resolvedChildId: string })[] = []
      for (const d of submittable) {
        if (d.childItemId) {
          resolved.push({ ...d, resolvedChildId: d.childItemId })
          continue
        }
        const childName = d.childName.trim()
        const childCode = d.childCode.trim() || suggestCode(childName, d.childItemType)
        if (!childCode) {
          failed.push(`"${childName}": couldn't generate a code`)
          continue
        }
        const cRes = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: childName,
            code: childCode,
            itemType: d.childItemType,
            genericPn: d.childGenericPn.trim() || null,
            // Inline BOM-child creation defaults: zero opening stock, and
            // min-stock 10 so they immediately show up on reorder-planning
            // screens instead of sitting at "no threshold set".
            minStock: 10,
          }),
        })
        const cBody = await cRes.json().catch(() => null)
        if (!cRes.ok) {
          failed.push(`"${childName}": ${extractError(cBody, "failed to create").message}`)
          continue
        }
        const newId = cBody?.data?.id as string | undefined
        if (!newId) {
          failed.push(`"${childName}": server did not return an id`)
          continue
        }
        resolved.push({ ...d, resolvedChildId: newId })
      }

      if (resolved.length === 0 && failed.length > 0) {
        return showToast({ type: "error", message: `Nothing could be saved — ${failed.length} row(s) failed`, hint: failed.join(" · ") })
      }

      const body = {
        lines: resolved.map((d) => ({
          childItemId: d.resolvedChildId,
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
      if (failed.length > 0) {
        showToast({ type: "error", message: `Saved ${fresh.lines.length} line(s), ${failed.length} skipped`, hint: failed.join(" · ") })
      } else {
        showToast({ type: "success", message: `Saved ${fresh.lines.length} line${fresh.lines.length === 1 ? "" : "s"}` })
      }
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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => router.push(withFromParam(`/items/details/${id}`, fromId))} className="gap-1.5">
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
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                {viewMode === "tree" ? (
                  <ListTree className="h-5 w-5 text-primary" />
                ) : (
                  <Table2 className="h-5 w-5 text-primary" />
                )}
                <div>
                  <CardTitle className="text-base">
                    {viewMode === "tree" ? "Assembly Tree" : "Lines"}
                  </CardTitle>
                  <CardDescription>
                    {viewMode === "tree"
                      ? `Visual breakdown of ${parent.name}. Sub-BOM children are marked so you can drill in.`
                      : isEditable
                        ? "Whole-version replace: add, edit or remove lines, then Save."
                        : `${selectedVersion?.status ?? ""} versions are read-only — click "New revision from this" to edit.`}
                  </CardDescription>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                {/* View mode switch */}
                <div className="inline-flex shrink-0 items-center rounded-lg border border-border bg-background p-0.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setViewMode("tree")}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                      viewMode === "tree"
                        ? "bg-primary text-primary-foreground shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <ListTree className="h-3.5 w-3.5" />
                    <span>Tree</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                      viewMode === "table"
                        ? "bg-primary text-primary-foreground shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Table2 className="h-3.5 w-3.5" />
                    <span>Table</span>
                  </button>
                </div>
                {isEditable && viewMode === "table" && (
                  <Button size="sm" onClick={addLine} disabled={saving} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Add line
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {draftLines.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No lines yet. {isEditable && "Click \"Add line\" to start."}</p>
              ) : viewMode === "tree" ? (
                <TreeViewBody
                  parent={parent}
                  draftLines={draftLines}
                  bomLines={bom?.lines ?? []}
                  childHasBomCache={childHasBomCache}
                  subBomByChild={subBomByChild}
                  loadingSubBom={loadingSubBom}
                  expandedChildren={expandedChildren}
                  toggleExpand={toggleExpand}
                  collapseAll={collapseAll}
                  maxDepth={MAX_TREE_DEPTH}
                />
              ) : (
                <div className="border border-border rounded-lg overflow-x-auto overflow-y-visible">
                  <table className="w-full text-sm min-w-[1200px]">
                    <thead className="text-[10px] uppercase bg-muted/40 text-muted-foreground border-b border-border">
                      <tr>
                        <th className="px-3 py-2 text-left font-bold min-w-[220px]">Name</th>
                        <th className="px-3 py-2 text-left font-bold w-32">Code</th>
                        <th className="px-3 py-2 text-left font-bold w-28">Type</th>
                        <th className="px-3 py-2 text-left font-bold w-32">Generic PN</th>
                        <th className="px-3 py-2 text-right font-bold w-20">Qty</th>
                        <th className="px-3 py-2 text-left font-bold w-32">Ref des</th>
                        <th className="px-3 py-2 text-left font-bold w-40">Preferred brand</th>
                        <th className="px-3 py-2 text-right font-bold w-16">Seq</th>
                        <th className="px-3 py-2 text-left font-bold">Remarks</th>
                        {isEditable && <th className="w-10" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {draftLines.map((d) => {
                        const linked = !!d.childItemId
                        const variants = linked ? (variantsByChild[d.childItemId] ?? []) : []
                        const rowMatches = openRow === d.key ? (matches[d.key] ?? []) : []
                        // Sub-BOM flag mirrors the Tree view: cross-ref the
                        // draft to its server line by id so edits keep the
                        // chip stable instead of flickering. For unsaved rows
                        // (no server line yet) fall back to the has-BOM cache
                        // populated from a direct lookup on the child.
                        const serverLine = d.id ? bom?.lines.find((l) => l.id === d.id) : undefined
                        const hasSubBom = serverLine?.childHasBom
                          ?? (d.childItemId ? childHasBomCache[d.childItemId] : undefined)
                          ?? false
                        return (
                          <tr key={d.key} className="hover:bg-muted/10 align-top">
                            <td className="px-3 py-2 relative">
                              <div className="relative">
                                <Input
                                  ref={(el) => setNameInputRef(d.key, el)}
                                  value={d.childName}
                                  onChange={(e) => onNameChange(d.key, e.target.value)}
                                  onFocus={() => { if (isEditable && d.childName.trim() && !linked) setOpenRow(d.key) }}
                                  onBlur={() => window.setTimeout(() => setOpenRow((r) => (r === d.key ? null : r)), 150)}
                                  disabled={!isEditable}
                                  placeholder="Search catalog — type a code or name…"
                                  className={`h-8 text-sm ${linked ? "pr-7" : ""}`}
                                  autoComplete="off"
                                />
                                {linked && (
                                  <Link2 className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-500" />
                                )}
                                {/* Sub-BOM signpost — sits under the input so
                                    it doesn't fight for row height. Chip flags
                                    that the child carries its own BOM; the
                                    arrow opens that child's BOM in a new tab
                                    so the current draft isn't lost. */}
                                {hasSubBom && (
                                  <span className="mt-0.5 flex items-center gap-1 text-[10px]">
                                    <span
                                      className="inline-flex items-center rounded border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 px-1 py-0.5 text-[9px] font-bold uppercase"
                                      title="This child has its own BOM"
                                    >
                                      sub-BOM
                                    </span>
                                    <a
                                      href={`/items/${encodeURIComponent(d.childItemId)}/bom`}
                                      target="_blank"
                                      rel="noopener"
                                      className="inline-flex items-center gap-0.5 text-sky-600 dark:text-sky-400 hover:underline font-semibold"
                                      title="Open this child's BOM in a new tab"
                                    >
                                      view <ChevronRight className="h-2.5 w-2.5" />
                                    </a>
                                  </span>
                                )}
                                {rowMatches.length > 0 && anchorRect && openRow === d.key && typeof window !== "undefined" && createPortal(
                                  <ul
                                    style={{
                                      position: "fixed",
                                      top: anchorRect.y + 2,
                                      left: anchorRect.x,
                                      width: Math.max(anchorRect.w, 260),
                                    }}
                                    className="z-[100] max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-xl"
                                  >
                                    {rowMatches.map((r) => (
                                      <li key={r.id}>
                                        <button
                                          type="button"
                                          onMouseDown={(e) => { e.preventDefault(); pickChild(d.key, r) }}
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
                                  </ul>,
                                  document.body,
                                )}
                                {isEditable && !linked && d.childName.trim() && (
                                  <span className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-600">
                                    <Sparkles className="h-3 w-3" /> New item — will be created on save (min stock 10)
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={d.childCode}
                                onChange={(e) => patchLine(d.key, { childCode: e.target.value })}
                                readOnly={linked}
                                disabled={!isEditable}
                                placeholder={linked ? "" : "auto"}
                                className={`h-8 text-sm font-mono ${linked ? "bg-muted/20" : ""}`}
                              />
                            </td>
                            <td className="px-3 py-2">
                              {linked ? (
                                <Input value={d.childItemType.replace("_", " ")} readOnly disabled={!isEditable} className="h-8 text-sm bg-muted/20" />
                              ) : (
                                <select
                                  value={d.childItemType}
                                  onChange={(e) => onTypeChange(d.key, e.target.value as ItemType)}
                                  disabled={!isEditable}
                                  className="h-8 w-full rounded-md border border-border bg-background px-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                                >
                                  <option value="raw">Raw</option>
                                  <option value="semi_assembled">Semi-assembled</option>
                                  <option value="assembled">Assembled</option>
                                  <option value="consumable">Consumable</option>
                                  <option value="asset">Asset</option>
                                  <option value="packaging">Packaging</option>
                                </select>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={d.childGenericPn}
                                onChange={(e) => patchLine(d.key, { childGenericPn: e.target.value })}
                                readOnly={linked}
                                disabled={!isEditable}
                                placeholder={linked ? "" : "e.g. 10K-0603-1%"}
                                className={`h-8 text-sm font-mono ${linked ? "bg-muted/20" : ""}`}
                              />
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

              {isEditable && viewMode === "table" && (
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
            <Link2 className="inline h-3 w-3 text-emerald-500" /> linked to a catalog item ·{" "}
            <Sparkles className="inline h-3 w-3 text-amber-500" /> a new item that will be created on save (zero opening stock, min stock 10).
          </p>
        </>
      )}
    </div>
  )
}

// ── Tree view helpers ──────────────────────────────────────────────────────
// A normalized shape both top-level draft lines and expanded sub-BOM lines
// render as. Keeps the recursive renderer type-clean and lets the top level
// still surface "unlinked / new" cards that the server hasn't seen.
interface TreeLine {
  key: string
  childItemId: string
  childCode: string
  childName: string
  childGenericPn: string
  childItemType: ItemType
  qty: string
  refDes: string
  preferredBrandSlug: string | null
  sequence: string
  remarks: string
  hasSubBom: boolean
  linked: boolean
}

function draftLinesToTree(
  draftLines: DraftLine[],
  bomLines: Line[],
  childHasBomCache: Record<string, boolean>,
): TreeLine[] {
  return draftLines.map((d) => {
    const linked = !!d.childItemId
    const serverLine = d.id ? bomLines.find((l) => l.id === d.id) : undefined
    const hasSubBom = serverLine?.childHasBom
      ?? (d.childItemId ? childHasBomCache[d.childItemId] : undefined)
      ?? false
    return {
      key: d.key,
      childItemId: d.childItemId,
      childCode: d.childCode,
      childName: d.childName,
      childGenericPn: d.childGenericPn,
      childItemType: d.childItemType,
      qty: d.qty,
      refDes: d.refDes,
      preferredBrandSlug: d.preferredBrandSlug,
      sequence: d.sequence,
      remarks: d.remarks,
      hasSubBom,
      linked,
    }
  })
}

function serverLinesToTree(lines: Line[]): TreeLine[] {
  return lines.map((l) => ({
    key: l.id,
    childItemId: l.childItemId,
    childCode: l.childCode,
    childName: l.childName,
    childGenericPn: l.childGenericPn ?? "",
    childItemType: l.childItemType,
    qty: String(l.qty),
    refDes: l.refDes ?? "",
    preferredBrandSlug: l.preferredBrandSlug,
    sequence: l.sequence == null ? "" : String(l.sequence),
    remarks: l.remarks ?? "",
    hasSubBom: l.childHasBom,
    linked: true,
  }))
}

interface TreeViewBodyProps {
  parent: ParentItem
  draftLines: DraftLine[]
  bomLines: Line[]
  childHasBomCache: Record<string, boolean>
  subBomByChild: Record<string, Line[]>
  loadingSubBom: Set<string>
  expandedChildren: Set<string>
  toggleExpand: (childItemId: string) => void
  collapseAll: () => void
  maxDepth: number
}

function TreeViewBody({
  parent, draftLines, bomLines, childHasBomCache, subBomByChild, loadingSubBom, expandedChildren, toggleExpand, collapseAll, maxDepth,
}: TreeViewBodyProps) {
  const ParentIcon = TYPE_META[parent.itemType].icon
  const roots = React.useMemo(
    () => draftLinesToTree(draftLines, bomLines, childHasBomCache),
    [draftLines, bomLines, childHasBomCache],
  )
  const anyExpanded = expandedChildren.size > 0

  return (
    <DragScrollArea className="p-6 md:p-8 overflow-x-auto">
      <div className="space-y-6">
        {/* Collapse-all control (only surfaced when something is open —
            we skip an "expand-all" since walking every sub-BOM eagerly
            can fan into dozens of requests; users expand what they care
            about). */}
        {anyExpanded && (
          <div className="flex justify-end -mt-2">
            <button
              type="button"
              onClick={collapseAll}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className="h-3 w-3" /> Collapse all
            </button>
          </div>
        )}

        {/* Root Item Node */}
        <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 p-3 rounded-lg w-fit shadow-xs">
          <ParentIcon className="h-5 w-5 text-primary" />
          <span className="font-extrabold text-primary text-sm uppercase tracking-wider">{parent.name}</span>
          <span className="font-mono text-[10px] font-bold text-primary/80 bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">
            {parent.code}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded border border-border">
            {TYPE_META[parent.itemType].label}
          </span>
        </div>

        <TreeChildren
          lines={roots}
          depth={0}
          maxDepth={maxDepth}
          subBomByChild={subBomByChild}
          loadingSubBom={loadingSubBom}
          expandedChildren={expandedChildren}
          toggleExpand={toggleExpand}
        />
      </div>
    </DragScrollArea>
  )
}

interface TreeChildrenProps {
  lines: TreeLine[]
  depth: number
  maxDepth: number
  subBomByChild: Record<string, Line[]>
  loadingSubBom: Set<string>
  expandedChildren: Set<string>
  toggleExpand: (childItemId: string) => void
}

function TreeChildren({ lines, depth, maxDepth, subBomByChild, loadingSubBom, expandedChildren, toggleExpand }: TreeChildrenProps) {
  if (lines.length === 0) {
    return <p className="pl-6 text-[11px] italic text-muted-foreground">No lines on this sub-BOM.</p>
  }
  return (
    <div className="relative pl-6 space-y-5 before:absolute before:left-3.5 before:top-0 before:bottom-3 before:w-[2px] before:bg-border/60">
      {lines.map((l, idx) => (
        <TreeCard
          key={l.key}
          line={l}
          idx={idx}
          depth={depth}
          maxDepth={maxDepth}
          subBomByChild={subBomByChild}
          loadingSubBom={loadingSubBom}
          expandedChildren={expandedChildren}
          toggleExpand={toggleExpand}
        />
      ))}
    </div>
  )
}

interface TreeCardProps {
  line: TreeLine
  idx: number
  depth: number
  maxDepth: number
  subBomByChild: Record<string, Line[]>
  loadingSubBom: Set<string>
  expandedChildren: Set<string>
  toggleExpand: (childItemId: string) => void
}

function TreeCard({ line, idx, depth, maxDepth, subBomByChild, loadingSubBom, expandedChildren, toggleExpand }: TreeCardProps) {
  const ChildIcon = TYPE_META[line.childItemType].icon
  const isExpanded = !!line.childItemId && expandedChildren.has(line.childItemId)
  const isLoading = !!line.childItemId && loadingSubBom.has(line.childItemId)
  const subLines = line.childItemId ? subBomByChild[line.childItemId] : undefined
  const canExpand = line.hasSubBom && line.linked && depth < maxDepth
  const atMaxDepth = line.hasSubBom && depth >= maxDepth
  const subTree = React.useMemo(() => (subLines ? serverLinesToTree(subLines) : []), [subLines])

  return (
    <div className="relative">
      {/* Connector line into the row */}
      <div className="absolute -left-6 top-5 w-6 h-[2px] border-t-2 border-dashed border-border" />
      <div className="flex flex-col gap-1.5 w-full max-w-md bg-background border border-border/80 rounded-xl p-3.5 relative z-10 shadow-2xs hover:border-primary/40 transition-all">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 min-w-0">
            {canExpand ? (
              <button
                type="button"
                onClick={() => toggleExpand(line.childItemId)}
                className="inline-flex h-4 w-4 items-center justify-center rounded hover:bg-muted/60 text-muted-foreground shrink-0"
                title={isExpanded ? "Collapse sub-BOM" : "Expand sub-BOM"}
              >
                {isLoading
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : isExpanded
                    ? <ChevronDown className="h-3 w-3" />
                    : <ChevronRight className="h-3 w-3" />}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <ChildIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {line.linked ? (
              <a
                href={`/items/details/${line.childItemId}`}
                className="font-bold text-foreground text-xs hover:text-primary hover:underline truncate"
              >
                {line.childName || line.childCode || `Line ${idx + 1}`}
              </a>
            ) : (
              <span className="font-bold text-foreground text-xs truncate">
                {line.childName || line.childCode || `Line ${idx + 1}`}
              </span>
            )}
            {line.hasSubBom && (
              <span
                className="text-[9px] font-bold uppercase rounded border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 px-1 py-0.5"
                title="This child has its own BOM"
              >
                sub-BOM
              </span>
            )}
            {!line.linked && (
              <span
                className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase rounded border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1 py-0.5"
                title="New item — will be created on save"
              >
                <Sparkles className="h-2.5 w-2.5" /> new
              </span>
            )}
          </div>
          <span className="font-mono text-xs font-bold text-primary shrink-0">× {line.qty || "0"}</span>
        </div>

        {/* Parity with the Table view: every column shows,
            so the tree card is a full read of the line. */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-2 pt-2 border-t border-border/40 text-[10px]">
          <div className="flex flex-col">
            <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">Code</span>
            <span className="font-mono font-bold text-primary truncate">{line.childCode || "—"}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">Type</span>
            <span className="font-bold text-foreground">{TYPE_META[line.childItemType].label}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">Generic PN</span>
            <span className="font-mono text-foreground truncate">{line.childGenericPn || "—"}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">Qty</span>
            <span className="font-mono font-bold text-primary">{line.qty || "0"}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">Ref des</span>
            <span className="font-mono text-foreground truncate">{line.refDes || "—"}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">Preferred brand</span>
            <span className="font-semibold text-foreground truncate">{line.preferredBrandSlug ?? "—"}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">Seq</span>
            <span className="font-mono text-foreground">{line.sequence || "—"}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">Linked</span>
            <span className={`font-bold ${line.linked ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
              {line.linked ? "catalog" : "new item"}
            </span>
          </div>
          <div className="col-span-2 flex flex-col">
            <span className="text-muted-foreground/60 font-semibold uppercase tracking-wider text-[8px]">Remarks</span>
            <span className="text-foreground/80 whitespace-normal break-words">{line.remarks || "—"}</span>
          </div>
        </div>

        {atMaxDepth && (
          <p className="text-[10px] italic text-muted-foreground mt-2">
            Max depth reached — open the child&apos;s own BOM page to keep drilling.
          </p>
        )}
      </div>

      {/* Recursive sub-tree render */}
      {isExpanded && (
        <div className="mt-3 ml-6">
          {isLoading && !subLines ? (
            <p className="pl-6 text-[11px] italic text-muted-foreground inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading sub-BOM…
            </p>
          ) : subLines ? (
            <TreeChildren
              lines={subTree}
              depth={depth + 1}
              maxDepth={maxDepth}
              subBomByChild={subBomByChild}
              loadingSubBom={loadingSubBom}
              expandedChildren={expandedChildren}
              toggleExpand={toggleExpand}
            />
          ) : (
            <p className="pl-6 text-[11px] italic text-muted-foreground">Failed to load sub-BOM.</p>
          )}
        </div>
      )}
    </div>
  )
}
