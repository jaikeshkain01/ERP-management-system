"use client"

/**
 * Compare two revisions of the same PCB — a side-by-side BOM diff.
 *
 * Diff is client-side: fetch each revision's BOM from `/api/pcbs/[id]/bom?revision=`
 * and match rows by component id. Every match is one of:
 *   Added     — in B, not in A
 *   Removed   — in A, not in B
 *   Changed   — in both, but qty / ref-des / preferred brand differ
 *   Unchanged — in both, identical (hidden by default)
 *
 * No server changes required — the endpoint already accepts a revision param.
 */

import * as React from "react"
import { X, GitBranch, Loader2, Plus, Minus, ArrowLeftRight, ArrowRight, Filter, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Revision {
  id: string
  rev: string
  status: "Draft" | "Active" | "Superseded" | "Obsolete"
  lineCount: number
}

interface BomLine {
  component: { id: string; genericPN: string; name: string; category: string | null; unit: string }
  qty: number
  refDes: string | null
  preferredBrand: { id: string; name: string } | null
  remarks: string | null
}

type ChangeKind = "added" | "removed" | "changed" | "unchanged"

interface DiffRow {
  kind: ChangeKind
  componentId: string
  name: string
  genericPN: string
  a: BomLine | null
  b: BomLine | null
  /** Machine-readable list of what actually differs, for the "Changed" rows. */
  changes: Array<"qty" | "refDes" | "preferredBrand" | "remarks">
}

const KIND_TONE: Record<ChangeKind, string> = {
  added: "bg-emerald-500/8 hover:bg-emerald-500/12",
  removed: "bg-destructive/8 hover:bg-destructive/12",
  changed: "bg-amber-500/8 hover:bg-amber-500/12",
  unchanged: "hover:bg-muted/10",
}
const KIND_BADGE: Record<ChangeKind, { label: string; className: string; icon: React.ElementType }> = {
  added: { label: "Added", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400", icon: Plus },
  removed: { label: "Removed", className: "bg-destructive/15 text-destructive border-destructive/30", icon: Minus },
  changed: { label: "Changed", className: "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400", icon: ArrowLeftRight },
  unchanged: { label: "Same", className: "bg-muted text-muted-foreground border-border", icon: CheckCircle2 },
}

export function CompareRevisionsModal({ pcbId, pcbName, revisions, onClose }: {
  pcbId: string
  pcbName: string
  revisions: Revision[]
  onClose: () => void
}) {
  // Default: compare the Active revision against whichever revision was created
  // just before it (typically the previous Rev). Fall back sensibly.
  const active = revisions.find((r) => r.status === "Active")
  const other = revisions.find((r) => r.id !== active?.id)
  const [aId, setAId] = React.useState<string>(other?.id ?? revisions[0]?.id ?? "")
  const [bId, setBId] = React.useState<string>(active?.id ?? revisions[1]?.id ?? revisions[0]?.id ?? "")
  const [aLines, setALines] = React.useState<BomLine[] | null>(null)
  const [bLines, setBLines] = React.useState<BomLine[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [showUnchanged, setShowUnchanged] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!aId || !bId) return
    let live = true
    setLoading(true); setError(null)
    ;(async () => {
      try {
        const [ra, rb] = await Promise.all([
          fetch(`/api/pcbs/${encodeURIComponent(pcbId)}/bom?revision=${aId}`, { cache: "no-store" }).then((r) => r.json()),
          fetch(`/api/pcbs/${encodeURIComponent(pcbId)}/bom?revision=${bId}`, { cache: "no-store" }).then((r) => r.json()),
        ])
        if (!live) return
        setALines(Array.isArray(ra?.data) ? ra.data : [])
        setBLines(Array.isArray(rb?.data) ? rb.data : [])
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Failed to load revisions")
      } finally {
        if (live) setLoading(false)
      }
    })()
    return () => { live = false }
  }, [pcbId, aId, bId])

  const diff = React.useMemo<DiffRow[]>(() => {
    if (!aLines || !bLines) return []
    const byIdA = new Map(aLines.map((l) => [l.component.id, l]))
    const byIdB = new Map(bLines.map((l) => [l.component.id, l]))
    const allIds = new Set<string>([...byIdA.keys(), ...byIdB.keys()])
    const rows: DiffRow[] = []
    for (const id of allIds) {
      const a = byIdA.get(id) ?? null
      const b = byIdB.get(id) ?? null
      const line = a ?? b!
      let kind: ChangeKind
      const changes: DiffRow["changes"] = []
      if (a && !b) kind = "removed"
      else if (!a && b) kind = "added"
      else {
        // Both sides — compare qty, ref-des, preferred brand, remarks.
        if (a!.qty !== b!.qty) changes.push("qty")
        if ((a!.refDes ?? "") !== (b!.refDes ?? "")) changes.push("refDes")
        if ((a!.preferredBrand?.id ?? "") !== (b!.preferredBrand?.id ?? "")) changes.push("preferredBrand")
        if ((a!.remarks ?? "") !== (b!.remarks ?? "")) changes.push("remarks")
        kind = changes.length ? "changed" : "unchanged"
      }
      rows.push({
        kind, componentId: id,
        name: line.component.name, genericPN: line.component.genericPN,
        a, b, changes,
      })
    }
    // Ordering: added → changed → removed → unchanged, then by name.
    const order: Record<ChangeKind, number> = { added: 0, changed: 1, removed: 2, unchanged: 3 }
    return rows.sort((x, y) => order[x.kind] - order[y.kind] || x.name.localeCompare(y.name))
  }, [aLines, bLines])

  const counts = React.useMemo(() => {
    const c: Record<ChangeKind, number> = { added: 0, removed: 0, changed: 0, unchanged: 0 }
    for (const r of diff) c[r.kind]++
    return c
  }, [diff])

  const visible = showUnchanged ? diff : diff.filter((r) => r.kind !== "unchanged")
  const sameRev = aId === bId

  const aRev = revisions.find((r) => r.id === aId)
  const bRev = revisions.find((r) => r.id === bId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" onClick={onClose}>
      <div className="w-full max-w-5xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            <div>
              <h3 className="text-base font-extrabold">Compare revisions — <span className="text-muted-foreground font-medium">{pcbName}</span></h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Row-level BOM diff between two revisions of this PCB.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Revision selectors */}
        <div className="border-b border-border bg-muted/10 px-5 py-3 flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Revision A (baseline)</label>
            <select
              value={aId}
              onChange={(e) => setAId(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm font-mono font-bold shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {revisions.map((r) => (
                <option key={r.id} value={r.id}>{r.rev} {r.status === "Active" ? "★" : `(${r.status})`}</option>
              ))}
            </select>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Revision B</label>
            <select
              value={bId}
              onChange={(e) => setBId(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm font-mono font-bold shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {revisions.map((r) => (
                <option key={r.id} value={r.id}>{r.rev} {r.status === "Active" ? "★" : `(${r.status})`}</option>
              ))}
            </select>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground cursor-pointer select-none">
              <Filter className="h-3.5 w-3.5" />
              <input
                type="checkbox"
                checked={showUnchanged}
                onChange={(e) => setShowUnchanged(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border text-primary"
              />
              Show unchanged rows
            </label>
          </div>
        </div>

        {/* Summary counts */}
        {!loading && !error && !sameRev && aLines && bLines && (
          <div className="flex flex-wrap gap-2 px-5 py-3 border-b border-border/60 bg-background shrink-0">
            {(["added", "removed", "changed", "unchanged"] as ChangeKind[]).map((k) => {
              const Icon = KIND_BADGE[k].icon
              return (
                <span key={k} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold ${KIND_BADGE[k].className}`}>
                  <Icon className="h-3 w-3" />
                  {counts[k]} {KIND_BADGE[k].label.toLowerCase()}
                </span>
              )
            })}
          </div>
        )}

        {/* Diff table */}
        <div className="p-5 overflow-y-auto flex-1">
          {sameRev ? (
            <div className="text-center text-sm text-muted-foreground py-16">Pick two different revisions to see a diff.</div>
          ) : loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-16 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading revisions…
            </div>
          ) : error ? (
            <div className="text-center text-sm text-destructive py-16">{error}</div>
          ) : visible.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-16">
              {diff.length === 0
                ? "Both revisions have empty BOMs."
                : `No differences between ${aRev?.rev} and ${bRev?.rev}. Toggle "Show unchanged" to see the shared BOM.`}
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground text-[10px] uppercase border-b border-border">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold w-24">Change</th>
                    <th className="px-3 py-2 text-left font-semibold">Component</th>
                    <th className="px-3 py-2 text-left font-semibold">Generic PN</th>
                    <th className="px-3 py-2 text-right font-semibold">Qty in {aRev?.rev}</th>
                    <th className="px-3 py-2 text-right font-semibold">Qty in {bRev?.rev}</th>
                    <th className="px-3 py-2 text-left font-semibold">Ref Des ({aRev?.rev})</th>
                    <th className="px-3 py-2 text-left font-semibold">Ref Des ({bRev?.rev})</th>
                    <th className="px-3 py-2 text-left font-semibold">Preferred brand</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {visible.map((row) => {
                    const badge = KIND_BADGE[row.kind]
                    const Icon = badge.icon
                    const qtyA = row.a?.qty
                    const qtyB = row.b?.qty
                    const qtyDelta = qtyA != null && qtyB != null ? qtyB - qtyA : null
                    return (
                      <tr key={row.componentId} className={KIND_TONE[row.kind]}>
                        <td className="px-3 py-2 align-top">
                          <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${badge.className}`}>
                            <Icon className="h-3 w-3" />
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-semibold align-top">{row.name}</td>
                        <td className="px-3 py-2 font-mono text-muted-foreground align-top">{row.genericPN}</td>
                        <td className="px-3 py-2 text-right font-mono align-top">
                          {qtyA ?? <span className="text-muted-foreground/60">—</span>}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono align-top ${row.changes.includes("qty") ? "font-bold text-amber-600 dark:text-amber-400" : ""}`}>
                          {qtyB ?? <span className="text-muted-foreground/60">—</span>}
                          {qtyDelta != null && qtyDelta !== 0 && (
                            <span className="ml-1 text-[10px] text-muted-foreground">({qtyDelta > 0 ? "+" : ""}{qtyDelta})</span>
                          )}
                        </td>
                        <td className={`px-3 py-2 truncate max-w-[160px] align-top text-muted-foreground ${row.changes.includes("refDes") ? "text-amber-600 dark:text-amber-400" : ""}`} title={row.a?.refDes ?? undefined}>
                          {row.a?.refDes ?? "—"}
                        </td>
                        <td className={`px-3 py-2 truncate max-w-[160px] align-top text-muted-foreground ${row.changes.includes("refDes") ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}`} title={row.b?.refDes ?? undefined}>
                          {row.b?.refDes ?? "—"}
                        </td>
                        <td className={`px-3 py-2 align-top text-muted-foreground ${row.changes.includes("preferredBrand") ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}`}>
                          {row.kind === "changed" ? (
                            <span>
                              {row.a?.preferredBrand?.name ?? "—"} → {row.b?.preferredBrand?.name ?? "—"}
                            </span>
                          ) : (
                            row.a?.preferredBrand?.name ?? row.b?.preferredBrand?.name ?? "—"
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-3 shrink-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}
