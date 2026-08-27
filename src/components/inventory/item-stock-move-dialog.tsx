"use client"

/**
 * Universal Stock In / Stock Out dialog — operates on `item_variant_id`, so it
 * services every item type (legacy component-backed AND universal-only). Posts
 * to POST /api/inventory/transactions. Replaced the legacy CBV-scoped
 * `stock-move-modal.tsx`, which was deleted in the F5.6 cleanup pass.
 */
import * as React from "react"
import { Button } from "@/components/ui/button"
import { ArrowDownToLine, ArrowUpFromLine, X } from "lucide-react"
import { extractError } from "@/lib/api-error"

export interface StockMoveVariant {
  id: string
  sourceKind: "purchased" | "manufactured"
  brandSlug: string | null
  partNo: string | null
  isDefault: boolean
}

export interface StockMoveItem {
  id: string
  code: string
  name: string
  baseUom: string
  variants: StockMoveVariant[]
}

interface Props {
  mode: "in" | "out"
  item: StockMoveItem
  onClose: () => void
  onDone: (msg: string) => void
}

function variantLabel(v: StockMoveVariant): string {
  if (v.sourceKind === "manufactured") return `Made in-house${v.partNo ? ` · ${v.partNo}` : ""}`
  return `${v.brandSlug ?? "brand"}${v.partNo ? ` · ${v.partNo}` : ""}${v.isDefault ? " (default)" : ""}`
}

export function ItemStockMoveDialog({ mode, item, onClose, onDone }: Props) {
  const isIn = mode === "in"
  // Stock In writes an IN row — semantically "received from outside". A
  // Made-in-house variant is never received; it grows through Production
  // completion. So on inbound we only offer purchased variants; outbound
  // stays open (you can adjust either direction).
  const eligibleVariants = React.useMemo(
    () => (isIn ? item.variants.filter((v) => v.sourceKind === "purchased") : item.variants),
    [isIn, item.variants],
  )
  const def = eligibleVariants.find((v) => v.isDefault) ?? eligibleVariants[0]

  const [variantId, setVariantId] = React.useState(def?.id ?? "")
  const [qty, setQty] = React.useState("")
  const [locationId, setLocationId] = React.useState("")
  const [lotNo, setLotNo] = React.useState("")
  const [supplierSlug, setSupplierSlug] = React.useState("")
  const [unitCost, setUnitCost] = React.useState("")
  const [expiry, setExpiry] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [bins, setBins] = React.useState<{ id: string; label: string; isDefault: boolean; kind: string }[]>([])
  const [binsLoaded, setBinsLoaded] = React.useState(false)
  const [suppliers, setSuppliers] = React.useState<{ slug: string; name: string }[]>([])

  // Outbound lot selection: "" = Auto (FEFO); a lot id = pin to that lot;
  // splitMode = manual multi-lot allocation.
  interface LotOption { id: string; lotNo: string; expiryDate: string | null; onHand: number }
  const [lots, setLots] = React.useState<LotOption[]>([])
  const [lotsLoading, setLotsLoading] = React.useState(false)
  const [lotId, setLotId] = React.useState("")
  const [splitMode, setSplitMode] = React.useState(false)
  const [allocations, setAllocations] = React.useState<{ lotId: string; qty: string }[]>([{ lotId: "", qty: "" }])

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
    // Suppliers only needed on inbound.
    if (isIn) {
      ;(async () => {
        try {
          const res = await fetch("/api/suppliers", { cache: "no-store" })
          const body = await res.json().catch(() => null)
          if (live && res.ok) setSuppliers((body?.data ?? []).map((s: { slug: string; name: string }) => ({ slug: s.slug, name: s.name })))
        } catch { /* non-fatal */ }
      })()
    }
    return () => { live = false }
  }, [isIn])

  // Outbound: (re)load the lots available for the chosen variant at the chosen
  // source location whenever either changes. Resets any stale lot selection.
  React.useEffect(() => {
    if (isIn || !variantId) { setLots([]); return }
    let live = true
    setLotsLoading(true)
    ;(async () => {
      try {
        const qs = new URLSearchParams({ variantId })
        if (locationId) qs.set("locationId", locationId)
        const res = await fetch(`/api/items/${item.id}/lots?${qs.toString()}`, { cache: "no-store" })
        const body = await res.json().catch(() => null)
        if (!live) return
        const all: LotOption[] = res.ok && Array.isArray(body?.data) ? body.data : []
        setLots(all)
        setLotId((cur) => (cur && !all.some((l) => l.id === cur) ? "" : cur))
      } finally { if (live) setLotsLoading(false) }
    })()
    return () => { live = false }
  }, [isIn, variantId, locationId, item.id])

  const allocTotal = allocations.reduce((s, a) => s + (Number(a.qty) || 0), 0)

  const submit = async () => {
    setError(null)
    // Outbound with a manual split: qty is the sum of allocations.
    const effectiveQty = !isIn && splitMode ? allocTotal : Number(qty)
    if (!variantId) { setError("Pick a variant"); return }
    if (!Number.isFinite(effectiveQty) || effectiveQty <= 0) { setError("Enter a positive quantity"); return }

    let lotAllocations: { lotId: string; qty: number }[] | undefined
    if (!isIn && splitMode) {
      const clean = allocations
        .filter((a) => a.lotId && Number(a.qty) > 0)
        .map((a) => ({ lotId: a.lotId, qty: Number(a.qty) }))
      if (clean.length === 0) { setError("Add at least one lot + quantity to the split"); return }
      const seen = new Set<string>()
      for (const a of clean) { if (seen.has(a.lotId)) { setError("A lot appears twice in the split — merge those rows"); return } seen.add(a.lotId) }
      lotAllocations = clean
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/inventory/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: isIn ? "IN" : "OUT",
          variantId,
          qty: effectiveQty,
          ...(locationId ? { locationId } : {}),
          ...(isIn && lotNo.trim() ? { lotNo: lotNo.trim() } : {}),
          ...(isIn && supplierSlug ? { supplierSlug } : {}),
          ...(isIn && expiry ? { expiryDate: expiry } : {}),
          ...(isIn && unitCost.trim() !== "" && Number.isFinite(Number(unitCost)) ? { unitCost: Number(unitCost) } : {}),
          // Outbound lot targeting: manual split wins, else a pinned lot, else FEFO.
          ...(!isIn && lotAllocations ? { lotAllocations }
             : !isIn && lotId ? { lotId } : {}),
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { setError(extractError(body, "Move failed").message); return }
      onDone(`${isIn ? "Stocked in" : "Stocked out"} ${effectiveQty.toLocaleString()} ${item.baseUom} · ${item.code}`)
    } finally { setSubmitting(false) }
  }

  const accent = isIn ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
              {isIn ? <ArrowDownToLine className="h-4.5 w-4.5" /> : <ArrowUpFromLine className="h-4.5 w-4.5" />}
            </div>
            <div>
              <h3 className="text-base font-extrabold text-foreground">{isIn ? "Stock In" : "Stock Out"}</h3>
              <p className="text-xs text-muted-foreground">{item.name} · <span className="font-mono">{item.code}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="rounded-md border border-destructive/35 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">{error}</div>}

          {eligibleVariants.length > 1 && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Variant</label>
              <select value={variantId} onChange={(e) => setVariantId(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary">
                {eligibleVariants.map((v) => <option key={v.id} value={v.id}>{variantLabel(v)}</option>)}
              </select>
              {isIn && (
                <p className="text-[10px] text-muted-foreground italic">
                  Made-in-house variants aren&apos;t shown here — they grow through Production completion, not manual Stock In.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quantity ({item.baseUom})</label>
              {!isIn && splitMode ? (
                <div className="h-9 flex items-center rounded-md border border-border bg-muted/30 px-3 text-sm font-mono text-muted-foreground" title="Driven by the lot split below">
                  {allocTotal.toLocaleString()} <span className="ml-1 text-[10px]">(from split)</span>
                </div>
              ) : (
                <input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus
                  placeholder="e.g. 500"
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm font-mono outline-none focus:ring-1 focus:ring-primary" />
              )}
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{isIn ? "Destination" : "Source"} bin</label>
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary">
                {!binsLoaded && <option value="">Loading…</option>}
                {binsLoaded && bins.length === 0 && <option value="">Workspace default</option>}
                {bins.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </div>
          </div>

          {isIn && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Lot no (optional)</label>
                <input value={lotNo} onChange={(e) => setLotNo(e.target.value)} placeholder="auto" data-scannable="lot" autoComplete="off"
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm font-mono outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Supplier (optional)</label>
                <select value={supplierSlug} onChange={(e) => setSupplierSlug(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary">
                  <option value="">— None —</option>
                  {suppliers.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Unit cost (optional)</label>
                <input type="number" min={0} step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="₹ per unit"
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm font-mono outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Expiry (optional)</label>
                <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} data-scannable="expiry"
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>
          )}
          {!isIn && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Lot selection</label>
                <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" checked={splitMode} onChange={(e) => setSplitMode(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
                  Split across lots
                </label>
              </div>

              {lotsLoading && <p className="text-[11px] text-muted-foreground italic">Loading lots…</p>}

              {/* Single-lot mode: Auto (FEFO) or pin one lot */}
              {!splitMode && (
                <>
                  <select value={lotId} onChange={(e) => setLotId(e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary">
                    <option value="">Auto (FEFO — earliest expiry first)</option>
                    {lots.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.lotNo} · {l.onHand.toLocaleString()} on hand{l.expiryDate ? ` · exp ${l.expiryDate}` : ""}
                      </option>
                    ))}
                  </select>
                  {!lotsLoading && lots.length === 0 && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">No lots with stock at this location — pick a different source bin.</p>
                  )}
                </>
              )}

              {/* Split mode: editable {lot, qty} rows with a running total */}
              {splitMode && (
                <div className="space-y-2">
                  {allocations.map((a, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select value={a.lotId}
                        onChange={(e) => setAllocations((rows) => rows.map((r, j) => j === i ? { ...r, lotId: e.target.value } : r))}
                        className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary">
                        <option value="">Pick a lot…</option>
                        {lots.map((l) => (
                          <option key={l.id} value={l.id}>{l.lotNo} · {l.onHand.toLocaleString()} avail{l.expiryDate ? ` · exp ${l.expiryDate}` : ""}</option>
                        ))}
                      </select>
                      <input type="number" min={0} step="any" value={a.qty} placeholder="qty"
                        onChange={(e) => setAllocations((rows) => rows.map((r, j) => j === i ? { ...r, qty: e.target.value } : r))}
                        className="h-8 w-24 rounded-md border border-border bg-background px-2 text-xs font-mono outline-none focus:ring-1 focus:ring-primary" />
                      <button type="button" onClick={() => setAllocations((rows) => rows.length > 1 ? rows.filter((_, j) => j !== i) : rows)}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between">
                    <button type="button" onClick={() => setAllocations((r) => [...r, { lotId: "", qty: "" }])}
                      className="text-[11px] font-semibold text-primary hover:underline">+ Add lot</button>
                    <span className="text-[11px] text-muted-foreground">Total: <span className="font-mono font-bold text-foreground">{allocTotal.toLocaleString()}</span> {item.baseUom}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button size="sm" onClick={() => void submit()} disabled={submitting}
            className={`gap-1.5 ${isIn ? "bg-emerald-600 text-white hover:bg-emerald-700" : ""}`}>
            {isIn ? <ArrowDownToLine className="h-3.5 w-3.5" /> : <ArrowUpFromLine className="h-3.5 w-3.5" />}
            {submitting ? "Saving…" : isIn ? "Stock In" : "Stock Out"}
          </Button>
        </div>
      </div>
    </div>
  )
}
