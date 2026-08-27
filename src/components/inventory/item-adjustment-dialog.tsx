"use client"

/**
 * Inventory adjustment dialog — physical-count corrections and other
 * non-receipt / non-issue movements. Writes an `ADJUSTMENT` inventory
 * transaction with a signed `qtyDelta` and a controlled `reason` code.
 *
 * Unlike Stock In / Stock Out, adjustments can hit ANY variant (purchased or
 * manufactured) — the semantic is "the ledger is wrong, bring it in line with
 * reality", not "we received / issued units". Negative deltas pull from a
 * FEFO lot; positive deltas fold into LOT-UNASSIGNED (same lot behavior the
 * server already implements for ADJUSTMENT).
 *
 * Reason vocabulary lives in `src/lib/inventory/adjustment-reasons.ts` — every
 * reason has a code (stored in `inventory_transactions.reason`), a label, a
 * hint, and a `sign` hint used to nudge the delta control. "Other" requires
 * a note so free-text explanations still land in `note`.
 */
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Scale, X, AlertCircle, Plus, Minus } from "lucide-react"
import { extractError } from "@/lib/api-error"
import { ADJUSTMENT_REASONS, adjustmentReasonByCode } from "@/lib/inventory/adjustment-reasons"

export interface AdjustmentVariant {
  id: string
  sourceKind: "purchased" | "manufactured"
  brandSlug: string | null
  partNo: string | null
  isDefault: boolean
}

export interface AdjustmentItem {
  id: string
  code: string
  name: string
  baseUom: string
  variants: AdjustmentVariant[]
}

interface Props {
  item: AdjustmentItem
  onClose: () => void
  onDone: (msg: string) => void
}

function variantLabel(v: AdjustmentVariant): string {
  if (v.sourceKind === "manufactured") return `Made in-house${v.partNo ? ` · ${v.partNo}` : ""}`
  return `${v.brandSlug ?? "brand"}${v.partNo ? ` · ${v.partNo}` : ""}${v.isDefault ? " (default)" : ""}`
}

export function ItemAdjustmentDialog({ item, onClose, onDone }: Props) {
  const def = item.variants.find((v) => v.isDefault) ?? item.variants[0]

  const [variantId, setVariantId] = React.useState(def?.id ?? "")
  // Sign is a separate control from magnitude so the direction is always
  // explicit — no accidentally-typed minus sign, no ambiguity in the ledger.
  const [sign, setSign] = React.useState<"+" | "-">("-")
  const [magnitude, setMagnitude] = React.useState("")
  const [reasonCode, setReasonCode] = React.useState<string>("")
  const [note, setNote] = React.useState("")
  const [locationId, setLocationId] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [bins, setBins] = React.useState<{ id: string; label: string; isDefault: boolean; kind: string }[]>([])
  const [binsLoaded, setBinsLoaded] = React.useState(false)

  const reason = adjustmentReasonByCode(reasonCode)

  // When the user picks a reason whose typical sign differs from the current
  // sign, auto-flip once — but leave it editable, since "count_correction"
  // and the two error reasons legitimately swing either way.
  React.useEffect(() => {
    if (!reason) return
    if (reason.sign === "positive" && sign === "-") setSign("+")
    else if (reason.sign === "negative" && sign === "+") setSign("-")
  }, [reason, sign])

  React.useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const whRes = await fetch("/api/warehouses", { cache: "no-store" })
        const whBody = await whRes.json().catch(() => null)
        if (!whRes.ok || !live) { setBinsLoaded(true); return }
        const collected: { id: string; label: string; isDefault: boolean; kind: string }[] = []
        for (const w of (whBody?.data ?? []) as { id: string; code: string }[]) {
          const locRes = await fetch(`/api/warehouses/${w.id}/locations`, { cache: "no-store" })
          const locBody = await locRes.json().catch(() => null)
          if (!locRes.ok) continue
          for (const loc of (locBody?.data ?? []) as { id: string; code: string; name: string | null; kind: string; isDefault: boolean }[]) {
            collected.push({
              id: loc.id, kind: loc.kind,
              isDefault: loc.isDefault && loc.kind === "bin",
              label: `${w.code} · ${loc.code}${loc.name ? ` — ${loc.name}` : ""} (${loc.kind}${loc.isDefault && loc.kind === "bin" ? ", default" : ""})`,
            })
          }
        }
        const rank = (k: string) => (k === "bin" ? 0 : k === "rack" ? 1 : 2)
        collected.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || rank(a.kind) - rank(b.kind) || a.label.localeCompare(b.label))
        if (!live) return
        setBins(collected)
        setLocationId(collected.find((b) => b.isDefault)?.id ?? collected[0]?.id ?? "")
        setBinsLoaded(true)
      } catch { if (live) setBinsLoaded(true) }
    })()
    return () => { live = false }
  }, [])

  const submit = async () => {
    setError(null)
    if (!variantId) { setError("Pick a variant"); return }
    const mag = Number(magnitude)
    if (!Number.isFinite(mag) || mag <= 0) { setError("Enter a positive quantity"); return }
    if (!reason) { setError("Pick a reason"); return }
    if (reason.requiresNote && !note.trim()) { setError('Note is required for "Other"'); return }

    const delta = sign === "+" ? mag : -mag

    setSubmitting(true)
    try {
      const res = await fetch("/api/inventory/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "ADJUSTMENT",
          variantId,
          qtyDelta: delta,
          locationId: locationId || undefined,
          reason: reason.code,
          note: note.trim() || undefined,
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { setError(extractError(body, "Failed to adjust stock").message); return }
      onDone(`Adjusted ${item.name} by ${sign}${mag.toLocaleString()} ${item.baseUom} (${reason.label})`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h3 className="text-sm font-bold text-foreground">Adjust stock</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-muted-foreground">
            Adjustments bring the ledger in line with reality — cycle counts, damage, loss, scrap.
            Not for receipts (use Stock In) or issues (use Stock Out).
          </p>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/35 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {item.variants.length > 1 && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Variant</label>
              <select value={variantId} onChange={(e) => setVariantId(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary">
                {item.variants.map((v) => <option key={v.id} value={v.id}>{variantLabel(v)}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-[auto_1fr] gap-2 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Direction</label>
              <div className="inline-flex h-9 items-center rounded-md border border-border bg-background p-0.5">
                <button
                  type="button"
                  onClick={() => setSign("+")}
                  className={`inline-flex items-center gap-1 rounded px-2.5 h-full text-xs font-bold transition-colors cursor-pointer ${
                    sign === "+" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Add stock"
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
                <button
                  type="button"
                  onClick={() => setSign("-")}
                  className={`inline-flex items-center gap-1 rounded px-2.5 h-full text-xs font-bold transition-colors cursor-pointer ${
                    sign === "-" ? "bg-destructive/10 text-destructive" : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Remove stock"
                >
                  <Minus className="h-3 w-3" /> Remove
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Quantity ({item.baseUom})
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={magnitude}
                onChange={(e) => setMagnitude(e.target.value)}
                placeholder="0"
                autoFocus
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm font-mono outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Reason</label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">— pick a reason —</option>
              {ADJUSTMENT_REASONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                  {r.sign === "positive" ? "  ⤴" : r.sign === "negative" ? "  ⤵" : ""}
                </option>
              ))}
            </select>
            {reason && (
              <p className="text-[10px] text-muted-foreground italic">{reason.hint}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Location
            </label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              disabled={!binsLoaded || bins.length === 0}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
            >
              {!binsLoaded && <option>Loading…</option>}
              {binsLoaded && bins.length === 0 && <option value="">— default —</option>}
              {bins.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Note {reason?.requiresNote ? <span className="text-destructive">*</span> : <span className="opacity-60">(optional)</span>}
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={reason?.requiresNote ? "Required — what happened?" : "Anything worth remembering later"}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/10 px-5 py-3">
          <div className="text-[11px] text-muted-foreground font-mono">
            {magnitude && reason ? (
              <>
                Δ <span className={sign === "+" ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-destructive font-bold"}>
                  {sign}{Number(magnitude).toLocaleString()}
                </span>{" "}
                <span className="opacity-60">{item.baseUom}</span>
              </>
            ) : (
              <span className="opacity-50">Pick direction + qty + reason</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => void submit()}
              disabled={submitting || !magnitude || !reasonCode}
              className={`gap-1.5 text-white ${sign === "+" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"}`}
            >
              <Scale className="h-3.5 w-3.5" /> {submitting ? "Adjusting…" : "Record adjustment"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
