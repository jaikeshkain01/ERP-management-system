"use client"

/**
 * Multi-revision management for a single PCB (your "division versions").
 *
 * The DB schema always supported multiple revisions per PCB — this card
 * exposes them: list all revisions, set one Active (primary), add a new
 * revision (blank or cloned from another), and see which product uses
 * which revision (a product's pinned revision is *not* always the PCB's
 * primary — e.g. ROIP400 can stay on Rev A while the PCB moves to Rev C).
 */

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { GitBranch, Plus, Star, Trash2, X, Check, AlertCircle, Package, ChevronRight, ChevronDown, Loader2, ListTree, ArrowLeftRight } from "lucide-react"
import { extractError } from "@/lib/api-error"
import { EditRevisionBomModal } from "@/components/pcb/edit-revision-bom-modal"
import { CompareRevisionsModal } from "@/components/pcb/compare-revisions-modal"

interface Revision {
  id: string
  rev: string
  status: "Draft" | "Active" | "Superseded" | "Obsolete"
  effectiveFrom: string | null
  effectiveTo: string | null
  lineCount: number
  usedByProductCount: number
  createdAt: string
}

interface UsageRow {
  revisionId: string
  rev: string
  productSlug: string
  productName: string
  productCode: string
  qtyPerUnit: number
}

interface RevisionBomLine {
  component: { id: string; genericPN: string; name: string; category: string | null; unit: string }
  qty: number
  refDes: string | null
  preferredBrand: { id: string; name: string } | null
  remarks: string | null
}

const STATUS_TONE: Record<Revision["status"], string> = {
  Active: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25 dark:text-emerald-400",
  Draft: "bg-amber-500/10 text-amber-600 border-amber-500/25 dark:text-amber-400",
  Superseded: "bg-muted text-muted-foreground border-border",
  Obsolete: "bg-destructive/10 text-destructive border-destructive/25",
}

export function PcbRevisionsCard({ pcbId, pcbName, onChange }: {
  /** PCB uuid or slug — anything the API resolves. */
  pcbId: string
  pcbName: string
  /** Called after any successful mutation so the parent can refresh its own BOM view. */
  onChange?: () => void
}) {
  const [revisions, setRevisions] = React.useState<Revision[]>([])
  const [usage, setUsage] = React.useState<UsageRow[]>([])
  const [loaded, setLoaded] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [toast, setToast] = React.useState<{ message: string; hint?: string; type: "success" | "error" } | null>(null)
  const [addOpen, setAddOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<Revision | null>(null)
  const [editBomTarget, setEditBomTarget] = React.useState<Revision | null>(null)
  const [compareOpen, setCompareOpen] = React.useState(false)
  // Which revision rows are expanded to show their BOM lines, and the cached
  // lines per revision (lazily fetched on first expand).
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  const [bomByRev, setBomByRev] = React.useState<Map<string, RevisionBomLine[] | "loading">>(new Map())

  const toggleExpanded = async (rev: Revision) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(rev.id)) next.delete(rev.id)
      else next.add(rev.id)
      return next
    })
    // Fetch the lines on first expand — cached thereafter (and invalidated when we
    // re-load the whole card after a mutation).
    if (!bomByRev.has(rev.id)) {
      setBomByRev((prev) => new Map(prev).set(rev.id, "loading"))
      try {
        const res = await fetch(`/api/pcbs/${encodeURIComponent(pcbId)}/bom?revision=${rev.id}`, { cache: "no-store" })
        const body = await res.json().catch(() => null)
        setBomByRev((prev) => new Map(prev).set(rev.id, res.ok ? body?.data ?? [] : []))
      } catch {
        setBomByRev((prev) => new Map(prev).set(rev.id, []))
      }
    }
  }

  const showToast = (msgOrInfo: string | { message: string; hint?: string }, type: "success" | "error" = "success") => {
    const info = typeof msgOrInfo === "string" ? { message: msgOrInfo } : msgOrInfo
    setToast({ ...info, type })
    setTimeout(() => setToast(null), type === "error" ? 6000 : 3000)
  }

  const load = React.useCallback(async () => {
    try {
      const [revsRes, usageRes] = await Promise.all([
        fetch(`/api/pcbs/${encodeURIComponent(pcbId)}/revisions`, { cache: "no-store" }),
        fetch(`/api/pcbs/${encodeURIComponent(pcbId)}/usage`, { cache: "no-store" }),
      ])
      const [revsBody, usageBody] = await Promise.all([revsRes.json().catch(() => null), usageRes.json().catch(() => null)])
      if (revsRes.ok && revsBody?.data) setRevisions(revsBody.data)
      if (usageRes.ok && usageBody?.data) setUsage(usageBody.data)
      // Invalidate BOM cache — a set-active or add-revision could change what's under a row.
      setBomByRev(new Map())
    } finally {
      setLoaded(true)
    }
  }, [pcbId])
  React.useEffect(() => { load() }, [load])

  const setActive = async (rev: Revision) => {
    if (rev.status === "Active") return
    setBusy(true)
    try {
      const res = await fetch(`/api/pcbs/${encodeURIComponent(pcbId)}/revisions/${rev.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Active" }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { showToast(extractError(body, `Failed to set ${rev.rev} as Active`), "error"); return }
      showToast(`${rev.rev} is now the Active revision`)
      await load()
      onChange?.()
    } finally { setBusy(false) }
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    setBusy(true)
    try {
      const res = await fetch(`/api/pcbs/${encodeURIComponent(pcbId)}/revisions/${deleteTarget.id}`, { method: "DELETE" })
      const body = await res.json().catch(() => null)
      if (!res.ok) { showToast(extractError(body, "Failed to delete revision"), "error"); return }
      showToast(`Revision ${deleteTarget.rev} deleted`)
      setDeleteTarget(null)
      await load()
      onChange?.()
    } finally { setBusy(false) }
  }

  // Group product usage rows by revision id for the panel below.
  const usageByRev = React.useMemo(() => {
    const m = new Map<string, UsageRow[]>()
    for (const u of usage) {
      const arr = m.get(u.revisionId) ?? []
      arr.push(u)
      m.set(u.revisionId, arr)
    }
    return m
  }, [usage])

  const activeRev = revisions.find((r) => r.status === "Active") ?? null

  if (!loaded) return null

  return (
    <>
      {toast && (
        <div className={`fixed bottom-5 right-5 z-[70] max-w-md flex items-start gap-2 px-4 py-3 rounded-lg border shadow-lg bg-background animate-in fade-in slide-in-from-bottom-5 ${
          toast.type === "success" ? "border-emerald-500/35 text-emerald-600 dark:text-emerald-400" : "border-destructive/35 text-destructive"
        }`}>
          {toast.type === "success" ? <Check className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" /> : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />}
          <div className="min-w-0">
            <div className="text-sm font-semibold">{toast.message}</div>
            {toast.hint && <div className="mt-1 text-xs font-medium text-muted-foreground">{toast.hint}</div>}
          </div>
        </div>
      )}

      <Card className="border border-border shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border bg-muted/20 px-6 py-4 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base font-bold">Revisions</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {revisions.length} revision{revisions.length === 1 ? "" : "s"} · Active: <span className="font-mono font-semibold text-foreground">{activeRev?.rev ?? "—"}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {revisions.length >= 2 && (
              <Button
                size="sm" variant="outline"
                className="gap-1.5 font-semibold border-border bg-background"
                onClick={() => setCompareOpen(true)}
                title="Diff any two revisions' BOMs"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" /><span>Compare</span>
              </Button>
            )}
            <Button size="sm" className="gap-1.5 font-semibold" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" /><span>Add revision</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-[11px] uppercase border-b border-border">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Revision</th>
                <th className="px-4 py-2 text-left font-semibold">Status</th>
                <th className="px-4 py-2 text-right font-semibold">Lines</th>
                <th className="px-4 py-2 text-left font-semibold">Used by</th>
                <th className="px-4 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {revisions.map((r) => {
                const users = usageByRev.get(r.id) ?? []
                const isOpen = expanded.has(r.id)
                const lines = bomByRev.get(r.id)
                return (
                  <React.Fragment key={r.id}>
                    <tr className="hover:bg-muted/10 align-top">
                      <td className="px-4 py-2.5 font-mono font-bold text-sm">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(r)}
                          className="inline-flex items-center gap-1.5 hover:text-primary transition-colors"
                          title={isOpen ? "Hide BOM" : "Show BOM"}
                        >
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          <span>{r.rev}</span>
                        </button>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[r.status]}`}>
                          {r.status === "Active" && <Star className="h-2.5 w-2.5 fill-current" />}
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">{r.lineCount}</td>
                      <td className="px-4 py-2.5">
                        {users.length === 0 ? (
                          <span className="text-xs text-muted-foreground/60">— not pinned by any product</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {users.map((u) => (
                              <span key={u.productSlug} className="inline-flex items-center gap-1 rounded-md bg-primary/5 border border-primary/20 px-1.5 py-0.5 text-[11px] font-semibold">
                                <Package className="h-3 w-3 text-primary" />
                                {u.productCode}
                                <span className="text-muted-foreground font-normal">× {u.qtyPerUnit}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary"
                            title="Edit BOM lines"
                            disabled={busy}
                            onClick={() => setEditBomTarget(r)}
                          >
                            <ListTree className="h-3.5 w-3.5" />
                          </Button>
                          {r.status !== "Active" && (
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-emerald-600"
                              title="Set as Active (primary)"
                              disabled={busy}
                              onClick={() => setActive(r)}
                            >
                              <Star className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title="Delete revision"
                            disabled={busy}
                            onClick={() => setDeleteTarget(r)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-muted/10">
                        <td colSpan={5} className="px-4 py-3">
                          <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-2">
                            {r.rev} — {r.lineCount} line{r.lineCount === 1 ? "" : "s"}
                          </div>
                          {lines === "loading" || lines === undefined ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading BOM…
                            </div>
                          ) : lines.length === 0 ? (
                            <div className="text-xs text-muted-foreground py-2">
                              No components on this revision. Edit the PCB structure to add lines, or clone from another revision when adding.
                            </div>
                          ) : (
                            <div className="border border-border rounded-md overflow-hidden bg-background">
                              <table className="w-full text-xs">
                                <thead className="bg-muted/40 text-muted-foreground text-[10px] uppercase border-b border-border">
                                  <tr>
                                    <th className="px-3 py-1.5 text-left font-semibold">Component</th>
                                    <th className="px-3 py-1.5 text-left font-semibold">Generic PN</th>
                                    <th className="px-3 py-1.5 text-right font-semibold">Qty</th>
                                    <th className="px-3 py-1.5 text-left font-semibold">Ref Des</th>
                                    <th className="px-3 py-1.5 text-left font-semibold">Preferred Brand</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                  {lines.map((l) => (
                                    <tr key={l.component.id} className="hover:bg-muted/20">
                                      <td className="px-3 py-1.5">{l.component.name}</td>
                                      <td className="px-3 py-1.5 font-mono text-muted-foreground">{l.component.genericPN}</td>
                                      <td className="px-3 py-1.5 text-right font-mono font-semibold">{l.qty}</td>
                                      <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[180px]" title={l.refDes ?? undefined}>{l.refDes ?? "—"}</td>
                                      <td className="px-3 py-1.5 text-muted-foreground">{l.preferredBrand?.name ?? "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
              {revisions.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No revisions yet.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {addOpen && (
        <AddRevisionModal
          pcbId={pcbId}
          pcbName={pcbName}
          revisions={revisions}
          onClose={() => setAddOpen(false)}
          onCreated={async (created, startedBlank) => {
            setAddOpen(false)
            await load()
            onChange?.()
            // A blank start has an empty BOM — chain straight into the line editor
            // so the user doesn't have to click a second time.
            if (startedBlank) setEditBomTarget(created)
          }}
          onError={(info) => showToast(info, "error")}
        />
      )}

      {compareOpen && (
        <CompareRevisionsModal
          pcbId={pcbId}
          pcbName={pcbName}
          revisions={revisions}
          onClose={() => setCompareOpen(false)}
        />
      )}

      {editBomTarget && (
        <EditRevisionBomModal
          pcbId={pcbId}
          revisionId={editBomTarget.id}
          revLabel={editBomTarget.rev}
          onClose={() => setEditBomTarget(null)}
          onSaved={async (msg) => {
            showToast(msg, "success")
            setEditBomTarget(null)
            await load()
            onChange?.()
          }}
          onError={(info) => showToast(info, "error")}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" onClick={() => !busy && setDeleteTarget(null)}>
          <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-4">
              <h3 className="text-base font-extrabold">Delete revision {deleteTarget.rev}</h3>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setDeleteTarget(null)} disabled={busy}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/25 p-3 rounded-xl text-destructive text-xs leading-relaxed font-semibold">
                <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
                <p>Blocked if any product still pins to this revision, or if it's the only revision left on this PCB.</p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={busy}>Cancel</Button>
                <Button type="button" onClick={doDelete} disabled={busy} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold min-w-[100px]">
                  {busy ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Add-revision modal ──────────────────────────────────────────────────────
function AddRevisionModal({ pcbId, revisions, onClose, onCreated, onError }: {
  pcbId: string
  pcbName: string
  revisions: Revision[]
  onClose: () => void
  /** `startedBlank=true` when the caller should open the line editor next. */
  onCreated: (created: Revision, startedBlank: boolean) => Promise<void> | void
  onError: (info: { message: string; hint?: string }) => void
}) {
  const [rev, setRev] = React.useState(() => suggestNextRev(revisions))
  const [status, setStatus] = React.useState<"Draft" | "Active">("Draft")
  const [cloneSource, setCloneSource] = React.useState<string>(revisions.find((r) => r.status === "Active")?.id ?? "")
  const [busy, setBusy] = React.useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rev.trim()) return onError({ message: "Revision label is required" })
    setBusy(true)
    try {
      const res = await fetch(`/api/pcbs/${encodeURIComponent(pcbId)}/revisions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rev: rev.trim(),
          status,
          cloneFromRevId: cloneSource || undefined,
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { onError(extractError(body, "Failed to add revision")); return }
      await onCreated(body.data as Revision, !cloneSource)
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-4">
          <h3 className="text-base font-extrabold">Add revision</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Label</label>
              <Input value={rev} onChange={(e) => setRev(e.target.value)} placeholder="Rev B" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "Draft" | "Active")}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="Draft">Draft (working copy)</option>
                <option value="Active">Active (promotes to primary)</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Starting BOM</label>
            <select
              value={cloneSource}
              onChange={(e) => setCloneSource(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">— Blank (start with no lines)</option>
              {revisions.map((r) => (
                <option key={r.id} value={r.id}>Clone from {r.rev} ({r.lineCount} line{r.lineCount === 1 ? "" : "s"})</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Cloning copies the source revision's BOM as-is. Edit lines afterwards on the PCB structure page.
            </p>
          </div>
          {status === "Active" && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/25 p-3 rounded-lg text-amber-700 dark:text-amber-400 text-xs font-medium">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Setting this Active demotes the current Active revision to Superseded. Products pinned to that revision keep their pin — they don't auto-move to the new Active.</span>
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy} className="min-w-[110px]">{busy ? "Adding…" : "Add revision"}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

/** Guess the next label — "Rev B" after "Rev A", "Rev 2" after "Rev 1", else "Rev A". */
function suggestNextRev(revisions: Revision[]): string {
  const labels = revisions.map((r) => r.rev)
  // Try to bump a trailing letter first: "Rev A" → "Rev B" etc.
  const letterMatch = labels
    .map((l) => l.match(/^(.*?)([A-Za-z])$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .sort((a, b) => b[2].charCodeAt(0) - a[2].charCodeAt(0))[0]
  if (letterMatch) {
    const [, prefix, letter] = letterMatch
    const next = String.fromCharCode(letter.toUpperCase().charCodeAt(0) + 1)
    if (next <= "Z") return `${prefix}${next}`
  }
  const numMatch = labels
    .map((l) => l.match(/^(.*?)(\d+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .sort((a, b) => Number(b[2]) - Number(a[2]))[0]
  if (numMatch) {
    const [, prefix, num] = numMatch
    return `${prefix}${Number(num) + 1}`
  }
  return "Rev A"
}
