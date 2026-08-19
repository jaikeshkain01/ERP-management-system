"use client"

/**
 * Edit the BOM lines of a specific PCB revision.
 *
 * A revision has an identity (label / status / effective dates) — those live
 * on the revisions row on `PcbRevisionsCard`. This modal focuses on the *lines*:
 * add/remove/edit BOM rows for one revision. On save the whole set is PATCHed
 * to `/api/pcbs/[id]/revisions/[revId]` with the `lines[]` field, which the
 * server replaces atomically (soft-deletes the old lines, inserts the new).
 */

import * as React from "react"
import { X, Plus, Trash2, AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useData } from "@/lib/data-provider"
import { extractError } from "@/lib/api-error"

interface Line {
  /** generic_pn of a linked catalog component; empty ⇒ new part created on save. */
  componentId: string
  name: string
  partNumber: string
  solderType: string
  footprint: string
  qty: string
}

const emptyLine = (): Line => ({
  componentId: "",
  name: "",
  partNumber: "",
  solderType: "SMD",
  footprint: "",
  qty: "1",
})

interface FetchedLine {
  component: { id: string; genericPN: string; name: string; category: string | null; unit: string }
  qty: number
  refDes: string | null
  preferredBrand: { id: string; name: string } | null
  remarks: string | null
}

export function EditRevisionBomModal({
  pcbId, revisionId, revLabel, onClose, onSaved, onError,
}: {
  pcbId: string
  revisionId: string
  revLabel: string
  onClose: () => void
  onSaved: (msg: string) => void
  onError: (info: { message: string; hint?: string }) => void
}) {
  const { COMPONENTS } = useData()
  const [lines, setLines] = React.useState<Line[]>([])
  const [loaded, setLoaded] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  // Load the current BOM of THIS revision so the user edits the exact set.
  React.useEffect(() => {
    let live = true
    ;(async () => {
      const res = await fetch(`/api/pcbs/${encodeURIComponent(pcbId)}/bom?revision=${revisionId}`, { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (!live) return
      const fetched: FetchedLine[] = res.ok && Array.isArray(body?.data) ? body.data : []
      setLines(
        fetched.length
          ? fetched.map((l) => ({
              componentId: l.component.genericPN,
              name: l.component.name,
              partNumber: l.component.genericPN,
              solderType: "SMD",
              footprint: "",
              qty: String(l.qty),
            }))
          : [emptyLine(), emptyLine()],
      )
      setLoaded(true)
    })()
    return () => { live = false }
  }, [pcbId, revisionId])

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const addLine = () => setLines((prev) => [...prev, emptyLine()])
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i))

  // Component picker suggestions — match name or generic PN.
  const suggestFor = (q: string) => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return COMPONENTS
      .filter((c) => c.name.toLowerCase().includes(s) || c.genericPN.toLowerCase().includes(s))
      .slice(0, 6)
  }
  const [openSuggest, setOpenSuggest] = React.useState<number | null>(null)

  const submit = async () => {
    // Only lines with actual content — skip blank rows the user left empty.
    const withContent = lines.filter((l) => l.name.trim() || l.partNumber.trim() || l.componentId.trim())
    if (withContent.some((l) => !l.name.trim() && !l.partNumber.trim() && !l.componentId.trim())) {
      onError({ message: "Every line needs a name, part number, or a linked component" })
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/pcbs/${encodeURIComponent(pcbId)}/revisions/${revisionId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: withContent.map((l) => ({
            componentId: l.componentId.trim() || undefined,
            name: l.name.trim() || undefined,
            partNumber: l.partNumber.trim() || undefined,
            solderType: l.solderType === "SMD" || l.solderType === "DIP" ? l.solderType : undefined,
            footprint: l.footprint.trim() || undefined,
            qty: Math.max(1, parseInt(l.qty, 10) || 1),
          })),
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { onError(extractError(body, "Failed to save revision BOM")); return }
      onSaved(`Saved ${withContent.length} line${withContent.length === 1 ? "" : "s"} on ${revLabel}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-4xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-4 shrink-0">
          <div>
            <h3 className="text-base font-extrabold">Edit BOM — <span className="font-mono text-primary">{revLabel}</span></h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Saves this revision only. Other revisions of the same PCB and any product pinned to a different revision are unaffected.
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose} disabled={busy}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {!loaded ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading current BOM…
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 uppercase text-[10px] text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold min-w-[200px]">Component Name</th>
                    <th className="px-3 py-2 text-left font-semibold min-w-[140px]">Generic PN</th>
                    <th className="px-3 py-2 text-left font-semibold">Solder</th>
                    <th className="px-3 py-2 text-left font-semibold min-w-[100px]">Footprint</th>
                    <th className="px-3 py-2 text-right font-semibold">Qty</th>
                    <th className="px-3 py-2 text-right font-semibold w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((l, i) => {
                    const suggestions = openSuggest === i ? suggestFor(l.name) : []
                    return (
                      <tr key={i} className="hover:bg-muted/10 align-top">
                        <td className="px-2 py-1.5 relative">
                          <Input
                            value={l.name}
                            onChange={(e) => { setLine(i, { name: e.target.value, componentId: "" }); setOpenSuggest(i) }}
                            onFocus={() => setOpenSuggest(i)}
                            onBlur={() => setTimeout(() => setOpenSuggest((cur) => (cur === i ? null : cur)), 150)}
                            placeholder="e.g. Resistor 10K"
                            className="h-7 text-xs"
                          />
                          {suggestions.length > 0 && (
                            <div className="absolute left-2 right-2 top-9 z-10 rounded-md border border-border bg-background shadow-lg overflow-hidden">
                              {suggestions.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  className="w-full flex items-center justify-between px-2 py-1.5 text-left text-xs hover:bg-muted/40"
                                  onMouseDown={(e) => {
                                    e.preventDefault()
                                    setLine(i, { name: c.name, componentId: c.genericPN, partNumber: c.genericPN })
                                    setOpenSuggest(null)
                                  }}
                                >
                                  <span className="font-semibold">{c.name}</span>
                                  <span className="font-mono text-[10px] text-muted-foreground">{c.genericPN}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {l.componentId && (
                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">Linked to {l.componentId}</p>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={l.partNumber}
                            onChange={(e) => setLine(i, { partNumber: e.target.value })}
                            placeholder="RES-10K-0603"
                            className="h-7 text-xs font-mono"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={l.solderType}
                            onChange={(e) => setLine(i, { solderType: e.target.value })}
                            className="flex h-7 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="SMD">SMD</option>
                            <option value="DIP">DIP</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            value={l.footprint}
                            onChange={(e) => setLine(i, { footprint: e.target.value })}
                            placeholder="0603"
                            className="h-7 text-xs font-mono"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number" min={1}
                            value={l.qty}
                            onChange={(e) => setLine(i, { qty: e.target.value })}
                            className="h-7 w-16 text-xs text-right font-mono"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeLine(i)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="border-t border-border bg-muted/10 px-3 py-2">
                <Button size="sm" variant="outline" className="gap-1.5 font-semibold" onClick={addLine}>
                  <Plus className="h-3.5 w-3.5" /> Add line
                </Button>
              </div>
            </div>
          )}
          {loaded && lines.filter((l) => l.name.trim() || l.partNumber.trim() || l.componentId).length === 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400 font-medium">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Saving with no populated lines will empty this revision's BOM (all current lines are soft-deleted). Add lines above to keep this revision non-empty.</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-3 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!loaded || busy} className="min-w-[110px] font-bold">
            {busy ? "Saving…" : "Save BOM"}
          </Button>
        </div>
      </div>
    </div>
  )
}
