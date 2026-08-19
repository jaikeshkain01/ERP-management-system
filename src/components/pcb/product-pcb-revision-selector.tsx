"use client"

/**
 * Small revision-pin selector shown next to a PCB card on the product structure page.
 *
 * A product `product_pcbs` link points at ONE specific revision of a PCB — not
 * the PCB itself. So the same PCB can appear across several products, each
 * pinned to a different revision. This selector lets a user re-point that pin.
 */

import * as React from "react"
import { GitBranch, Check, AlertCircle, Loader2 } from "lucide-react"
import { extractError } from "@/lib/api-error"

interface Revision {
  id: string
  rev: string
  status: "Draft" | "Active" | "Superseded" | "Obsolete"
  lineCount: number
}

export function ProductPcbRevisionSelector({
  productId, pcbId, linkId, currentRevision, onChanged,
}: {
  productId: string
  /** PCB uuid or slug — same shape the API accepts. */
  pcbId: string
  /** `product_pcbs.id` — the link row being repointed. */
  linkId: string
  currentRevision: { id: string; rev: string; status: string }
  /** Called after a successful swap so the parent can refresh derived views. */
  onChanged?: () => void
}) {
  const [revisions, setRevisions] = React.useState<Revision[]>([])
  const [pinned, setPinned] = React.useState(currentRevision.id)
  const [busy, setBusy] = React.useState(false)
  const [toast, setToast] = React.useState<{ message: string; hint?: string; type: "success" | "error" } | null>(null)

  // Keep the local pin in sync with the parent when it re-renders after a refresh.
  React.useEffect(() => setPinned(currentRevision.id), [currentRevision.id])

  React.useEffect(() => {
    let live = true
    ;(async () => {
      const res = await fetch(`/api/pcbs/${encodeURIComponent(pcbId)}/revisions`, { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (live && res.ok && body?.data) setRevisions(body.data)
    })()
    return () => { live = false }
  }, [pcbId])

  const showToast = (info: { message: string; hint?: string }, type: "success" | "error") => {
    setToast({ ...info, type })
    setTimeout(() => setToast(null), type === "error" ? 6000 : 3000)
  }

  const swap = async (nextId: string) => {
    if (nextId === pinned) return
    const prev = pinned
    setPinned(nextId) // optimistic
    setBusy(true)
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(productId)}/pcbs/${linkId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pcbRevisionId: nextId }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setPinned(prev) // revert
        showToast(extractError(body, "Failed to swap revision"), "error")
        return
      }
      const newRev = revisions.find((r) => r.id === nextId)
      showToast({ message: `Pinned to ${newRev?.rev ?? "new revision"}` }, "success")
      onChanged?.()
    } finally {
      setBusy(false)
    }
  }

  // Active revision gets a visual highlight so the user can see when this
  // product is on an "older" (Superseded) or "newer" (Draft) pin.
  const currentLabel = revisions.find((r) => r.id === pinned) ?? { rev: currentRevision.rev, status: currentRevision.status }
  const activeRev = revisions.find((r) => r.status === "Active")
  const notOnPrimary = activeRev && activeRev.id !== pinned

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

      <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px]">
        <GitBranch className="h-3 w-3 text-muted-foreground" />
        <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[9px]">Rev</span>
        <select
          value={pinned}
          onChange={(e) => swap(e.target.value)}
          disabled={busy || revisions.length === 0}
          className="bg-transparent font-mono font-bold text-foreground focus:outline-none cursor-pointer disabled:opacity-60"
          title="Change which revision of this PCB this product uses"
        >
          {revisions.length === 0 && <option value={currentRevision.id}>{currentRevision.rev}</option>}
          {revisions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.rev} {r.status === "Active" ? "★" : r.status === "Draft" ? "(Draft)" : r.status === "Obsolete" ? "(Obsolete)" : ""}
            </option>
          ))}
        </select>
        {busy && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        {!busy && notOnPrimary && (
          <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400" title={`Primary is ${activeRev?.rev}`}>
            {currentLabel.status === "Draft" ? "Draft" : "Not primary"}
          </span>
        )}
      </div>
    </>
  )
}
