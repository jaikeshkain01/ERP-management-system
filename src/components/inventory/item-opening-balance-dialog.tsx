"use client"

/**
 * Opening-balance dialog for made-in-house items (sub_assembly / finished_product).
 *
 * A pure Made-in-house item can't be received via Stock In (the button is
 * greyed on Inventory because manufactured variants aren't shopped from a
 * supplier). But you still need a way to record units that already exist —
 * pre-ERP inventory, physical-count corrections, or units built off the
 * work-order path. This dialog writes one `PRODUCTION` row against the
 * item's manufactured variant, so it lands in the same slot that a completed
 * production order would.
 *
 * Kept intentionally simpler than ItemStockMoveDialog: no supplier, no MPN,
 * no manual lot number. The server auto-generates the lot; reason column
 * marks it as `opening_balance` so reports can distinguish it from a real
 * production run.
 */
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Factory, X, AlertCircle } from "lucide-react"
import { extractError } from "@/lib/api-error"

export interface OpeningBalanceItem {
  id: string
  code: string
  name: string
  baseUom: string
  /** The Made-in-house variant id. Required — the dialog writes into it. */
  manufacturedVariantId: string
}

interface Props {
  item: OpeningBalanceItem
  onClose: () => void
  onDone: (msg: string) => void
}

export function ItemOpeningBalanceDialog({ item, onClose, onDone }: Props) {
  const [qty, setQty] = React.useState("")
  const [locationId, setLocationId] = React.useState("")
  const [note, setNote] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Warehouse locations picker. Same shape as ItemStockMoveDialog uses.
  const [bins, setBins] = React.useState<{ id: string; label: string; isDefault: boolean; kind: string }[]>([])
  const [binsLoaded, setBinsLoaded] = React.useState(false)

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
    const n = Number(qty)
    if (!Number.isFinite(n) || n <= 0) { setError("Enter a positive quantity"); return }
    setSubmitting(true)
    try {
      const res = await fetch("/api/inventory/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "PRODUCTION",
          variantId: item.manufacturedVariantId,
          qty: n,
          locationId: locationId || undefined,
          refType: "opening_balance",
          reason: note.trim() || "Opening balance",
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { setError(extractError(body, "Failed to record opening qty").message); return }
      onDone(`Recorded ${n.toLocaleString()} ${item.baseUom} of ${item.name}`)
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
            <Factory className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-bold text-foreground">Record opening qty</h3>
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
            Adds units to the <span className="font-semibold text-foreground">Made-in-house</span> variant of{" "}
            <span className="font-semibold text-foreground">{item.name}</span>. Use this for pre-ERP inventory
            or a physical-count correction on a made item. For a normal build, use Production → Complete instead.
          </p>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/35 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Quantity ({item.baseUom})
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              autoFocus
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm font-mono outline-none focus:ring-1 focus:ring-primary"
            />
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
              Note <span className="opacity-60">(optional)</span>
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Opening balance from Q3 stocktake"
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="text-[10px] text-muted-foreground italic">
              Recorded as a PRODUCTION ledger row with ref type `opening_balance`.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/10 px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={submitting || !qty}
            className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Factory className="h-3.5 w-3.5" /> {submitting ? "Recording…" : "Record"}
          </Button>
        </div>
      </div>
    </div>
  )
}
