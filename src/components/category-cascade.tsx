"use client"

import * as React from "react"
import { Pencil, Trash2, Check, X } from "lucide-react"
import { useData } from "@/lib/data-provider"

/**
 * Dynamic multi-level category picker. Renders one <select> per tree level:
 * level 0 = root categories, and each further level appears once the node chosen
 * above it has children. `value` is always the DEEPEST selected node's id (""
 * means nothing selected); descendant filtering elsewhere keys off that node's
 * path, so a mid-level pick still covers everything beneath it.
 *
 * When `manage` is set, an inline rename/delete row appears for the deepest
 * selected node (PATCH/DELETE /api/item-categories/[id]); delete is blocked by
 * the backend for a node with children or items.
 */
export function CategoryCascade({
  value,
  onChange,
  allLabel = "— Select —",
  className,
  manage = false,
  stageFilter,
}: {
  value: string
  onChange: (id: string) => void
  /** Label for the empty option at the top level (e.g. "All Categories"). */
  allLabel?: string
  className?: string
  /** Show inline rename/delete controls for the selected node. */
  manage?: boolean
  /** Slice 2: filter the picker to categories belonging to this stage.
   *  A root is visible when the root itself OR any descendant matches the
   *  stage — so a stage-scoped user still sees the whole subtree. */
  stageFilter?: string
}) {
  const d = useData()
  const [renaming, setRenaming] = React.useState(false)
  const [rename, setRename] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const selectedNode = value ? d.getCategory(value) : undefined
  React.useEffect(() => { setRenaming(false); setError(null) }, [value])

  const submitRename = async () => {
    const nm = rename.trim()
    if (!nm || !selectedNode) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/item-categories/${selectedNode.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nm }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { setError(body?.error?.message ?? "Rename failed"); return }
      await d.reload()
      setRenaming(false)
    } finally { setBusy(false) }
  }

  const submitDelete = async () => {
    if (!selectedNode) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/item-categories/${selectedNode.id}`, { method: "DELETE" })
      const body = await res.json().catch(() => null)
      if (!res.ok) { setError(body?.error?.message ?? "Delete failed"); return }
      // Fall back to the deleted node's parent (or clear) so the picker stays valid.
      onChange(selectedNode.parentId ?? "")
      await d.reload()
    } finally { setBusy(false) }
  }

  // Ancestor chain root→…→value, derived from the selected node's parent links.
  const chain: string[] = []
  let cur = value ? d.getCategory(value) : undefined
  while (cur) {
    chain.unshift(cur.id)
    cur = cur.parentId ? d.getCategory(cur.parentId) : undefined
  }

  // One row per level: the roots, then a child-select under each chosen node
  // that actually has children (so the user can drill deeper, optionally).
  const levels: { parentId: string | null; selected: string }[] = [{ parentId: null, selected: chain[0] ?? "" }]
  for (let i = 0; i < chain.length; i++) {
    if (d.categoryChildren(chain[i]).length) {
      levels.push({ parentId: chain[i], selected: chain[i + 1] ?? "" })
    }
  }

  const handle = (levelIdx: number, id: string) => {
    // Picking a node makes it the value; clearing a level falls back to its parent.
    onChange(id || (levels[levelIdx].parentId ?? ""))
  }

  const selectCls =
    "h-9 rounded-lg border border-border bg-background px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary font-medium min-w-[10rem]"

  const iconBtn =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground disabled:opacity-50"

  // Stage filter: a node is visible if IT matches, or any descendant does.
  // We compute this once per render by memoizing on the stage + dataset.
  const visibleIds = React.useMemo(() => {
    if (!stageFilter) return null
    const roots = d.categoryChildren(null)
    const allow = new Set<string>()
    const walk = (node: { id: string; defaultItemType: string | null }): boolean => {
      const children = d.categoryChildren(node.id)
      let anyChild = false
      for (const kid of children) if (walk(kid as unknown as { id: string; defaultItemType: string | null })) anyChild = true
      const self = node.defaultItemType === stageFilter
      if (self || anyChild) allow.add(node.id)
      return self || anyChild
    }
    for (const r of roots) walk(r as unknown as { id: string; defaultItemType: string | null })
    return allow
  }, [d, stageFilter])

  const filteredChildren = (parentId: string | null) =>
    d.categoryChildren(parentId).filter((c) => !visibleIds || visibleIds.has(c.id))

  return (
    <div className="space-y-2">
      <div className={className ?? "flex flex-wrap gap-2"}>
        {levels.map((lv, idx) => (
          <select key={idx} value={lv.selected} onChange={(e) => handle(idx, e.target.value)} className={selectCls}>
            <option value="">{idx === 0 ? allLabel : "— All —"}</option>
            {filteredChildren(lv.parentId).map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        ))}
      </div>

      {manage && selectedNode && (
        <div className="flex flex-wrap items-center gap-2">
          {renaming ? (
            <>
              <input
                autoFocus
                value={rename}
                onChange={(e) => setRename(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitRename() } }}
                className={selectCls}
                placeholder="New name"
              />
              <button type="button" onClick={submitRename} disabled={busy} className={iconBtn} title="Save">
                <Check className="h-4 w-4 text-emerald-500" />
              </button>
              <button type="button" onClick={() => { setRenaming(false); setError(null) }} disabled={busy} className={iconBtn} title="Cancel">
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <span className="text-xs text-muted-foreground">
                Editing <span className="font-semibold text-foreground">{selectedNode.name}</span>
              </span>
              <button type="button" onClick={() => { setRename(selectedNode.name); setRenaming(true); setError(null) }} disabled={busy} className={iconBtn} title="Rename category">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={submitDelete} disabled={busy} className={`${iconBtn} hover:text-destructive`} title="Delete category">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {error && <span className="text-xs font-medium text-destructive">{error}</span>}
        </div>
      )}
    </div>
  )
}
