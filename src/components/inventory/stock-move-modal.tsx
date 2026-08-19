"use client"

import * as React from "react"
import { X, ArrowDownToLine, ArrowUpFromLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useData } from "@/lib/data-provider"
import type { StockDirection } from "@/lib/catalog"
import type { BrandStock, NewTransactionInput } from "@/lib/stock-ledger"

type Props = {
  mode: StockDirection
  componentId: string
  componentName: string
  brandStocks: BrandStock[]
  onSubmit: (input: NewTransactionInput) => void
  onClose: () => void
}

export function StockMoveModal({ mode, componentId, componentName, brandStocks, onSubmit, onClose }: Props) {
  const { BRANDS, SUPPLIERS, getBrandName } = useData()
  const isIn = mode === "in"

  // Existing brands first (so the common case is one click), then the rest.
  const existingIds = new Set(brandStocks.map((b) => b.brandId))
  const brandOptions = [
    ...brandStocks.map((b) => ({ id: b.brandId, name: getBrandName(b.brandId) })),
    ...BRANDS.filter((b) => !existingIds.has(b.id)).map((b) => ({ id: b.id, name: b.name })),
  ]

  const [brandId, setBrandId] = React.useState(brandOptions[0]?.id ?? "")
  const [supplierId, setSupplierId] = React.useState("")
  const [qty, setQty] = React.useState("")
  const [lotNo, setLotNo] = React.useState("")
  const [expiryDate, setExpiryDate] = React.useState("")
  const [locationId, setLocationId] = React.useState("")
  // Outbound: lets the user pin the move to a specific lot instead of FEFO.
  // Blank string → Auto (FEFO). Server validates the chosen lot has stock.
  const [lotId, setLotId] = React.useState("")
  // Multi-lot split: when enabled, the single-lot picker is replaced with a
  // table of {lotId, qty} rows. Sum of qtys must equal total qty on submit.
  const [splitMode, setSplitMode] = React.useState(false)
  const [allocations, setAllocations] = React.useState<{ lotId: string; qty: string }[]>([{ lotId: "", qty: "" }])
  const [note, setNote] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  const brandOnHand = brandStocks.find((b) => b.brandId === brandId)?.stock ?? 0

  interface LotOption {
    id: string
    lotNo: string
    brandSlug: string
    partNo: string | null
    supplierName: string | null
    receivedDate: string | null
    expiryDate: string | null
    onHand: number
  }
  const [lots, setLots] = React.useState<LotOption[]>([])
  const [lotsLoading, setLotsLoading] = React.useState(false)

  // Fetch lots for this component + brand on stock-out so the user can pick which
  // batch to consume from. Refetches when the brand selection changes.
  React.useEffect(() => {
    if (isIn || !componentId) return
    let live = true
    setLotsLoading(true)
    ;(async () => {
      try {
        const res = await fetch(`/api/item-lots?componentId=${encodeURIComponent(componentId)}`, { cache: "no-store" })
        const body = await res.json().catch(() => null)
        if (!live) return
        const all: LotOption[] = res.ok && Array.isArray(body?.data) ? body.data : []
        setLots(all.filter((l) => l.brandSlug === brandId && l.onHand > 0))
        // If the previously chosen lot is no longer valid, reset to Auto.
        setLotId((cur) => (cur && !all.some((l) => l.id === cur && l.brandSlug === brandId) ? "" : cur))
      } finally {
        if (live) setLotsLoading(false)
      }
    })()
    return () => { live = false }
  }, [componentId, brandId, isIn])

  const pickedLot = lots.find((l) => l.id === lotId) ?? null
  // Cap outbound qty to the picked lot's on-hand if one is picked.
  const outboundCap = pickedLot ? pickedLot.onHand : brandOnHand
  const daysUntilExpiry = (iso: string | null) =>
    iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null

  // Destination bins for the optional putaway picker (inbound only). Blank selection
  // keeps the default (bulk) bin. Bins are grouped by warehouse.
  const [binGroups, setBinGroups] = React.useState<{ warehouse: string; bins: { id: string; label: string }[] }[]>([])
  React.useEffect(() => {
    if (!isIn) return
    let active = true
    ;(async () => {
      try {
        const whRes = await fetch("/api/warehouses", { cache: "no-store" })
        const whBody = await whRes.json().catch(() => null)
        const warehouses: { id: string; code: string }[] = whRes.ok ? whBody?.data ?? [] : []
        const groups = await Promise.all(
          warehouses.map(async (w) => {
            const locRes = await fetch(`/api/warehouses/${w.id}/locations`, { cache: "no-store" })
            const locBody = await locRes.json().catch(() => null)
            const bins = (locRes.ok ? locBody?.data ?? [] : [])
              .filter((l: { kind: string }) => l.kind === "bin")
              .map((l: { id: string; code: string; name: string | null; isDefault: boolean }) => ({
                id: l.id,
                label: `${l.code}${l.name ? ` · ${l.name}` : ""}${l.isDefault ? " (default)" : ""}`,
              }))
            return { warehouse: w.code, bins }
          }),
        )
        if (active) setBinGroups(groups.filter((g) => g.bins.length > 0))
      } catch {
        /* picker just stays at the default-bin option */
      }
    })()
    return () => { active = false }
  }, [isIn])

  const submit = () => {
    const n = Number(qty)
    if (!brandId) return setError("Select a manufacturer.")
    if (!Number.isFinite(n) || n <= 0) return setError("Enter a quantity greater than 0.")

    // Multi-lot split validation (outbound only). The submit payload will send
    // `lotAllocations` and the server writes one ledger row per allocation.
    let splitPayload: { lotId: string; qty: number }[] | undefined
    if (!isIn && splitMode) {
      const rows = allocations
        .map((a) => ({ lotId: a.lotId, qty: Number(a.qty) }))
        .filter((a) => a.lotId && Number.isFinite(a.qty) && a.qty > 0)
      if (rows.length === 0) return setError("Add at least one lot allocation, or turn off the split.")
      // No lot used twice.
      const seen = new Set<string>()
      for (const r of rows) {
        if (seen.has(r.lotId)) return setError("The same lot is listed twice — merge those rows.")
        seen.add(r.lotId)
      }
      const total = rows.reduce((s, r) => s + r.qty, 0)
      if (Math.abs(total - n) > 1e-9) {
        return setError(`Split total is ${total.toLocaleString()} — must equal the total qty (${n.toLocaleString()}).`)
      }
      for (const r of rows) {
        const lot = lots.find((l) => l.id === r.lotId)
        if (lot && r.qty > lot.onHand) {
          return setError(`Lot ${lot.lotNo} only has ${lot.onHand.toLocaleString()} on hand — reduce that row.`)
        }
      }
      splitPayload = rows
    } else if (!isIn) {
      // Single-lot or auto (FEFO) — cap qty by picked lot's on-hand or total.
      if (pickedLot && n > pickedLot.onHand) {
        return setError(`Lot ${pickedLot.lotNo} only has ${pickedLot.onHand.toLocaleString()} on hand — reduce the qty or switch to Auto (FEFO).`)
      }
      if (!pickedLot && n > brandOnHand) {
        return setError(`Only ${brandOnHand.toLocaleString()} in stock for ${getBrandName(brandId)}.`)
      }
    }

    onSubmit({
      componentId,
      brandId,
      supplierId: isIn ? supplierId || undefined : undefined,
      direction: mode,
      qty: n,
      note,
      ...(isIn
        ? { lotNo, expiryDate, locationId: locationId || undefined }
        : splitPayload
          ? { lotAllocations: splitPayload }
          : { lotId: lotId || undefined }),
    })
  }

  const accent = isIn
    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : "bg-amber-500/10 text-amber-600 dark:text-amber-400"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
              {isIn ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold">{isIn ? "Stock In" : "Stock Out"}</h3>
              <p className="text-xs text-muted-foreground">{componentName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Manufacturer</label>
            <select
              value={brandId}
              onChange={(e) => { setBrandId(e.target.value); setError(null) }}
              className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
            >
              {brandOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}{existingIds.has(b.id) ? "" : " (new)"}
                </option>
              ))}
            </select>
            {!isIn && (
              <p className="text-[11px] text-muted-foreground">
                {pickedLot
                  ? <>On hand in <span className="font-mono">{pickedLot.lotNo}</span>: {pickedLot.onHand.toLocaleString()}</>
                  : <>On hand: {brandOnHand.toLocaleString()}</>}
              </p>
            )}
          </div>

          {!isIn && (() => {
            // FEFO-ordered lot list is used in both single and split modes.
            const sortedLots = lots.slice().sort((a, b) => {
              const ax = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity
              const bx = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity
              if (ax !== bx) return ax - bx
              const ar = a.receivedDate ? new Date(a.receivedDate).getTime() : 0
              const br = b.receivedDate ? new Date(b.receivedDate).getTime() : 0
              return ar - br
            })
            const lotOptionLabel = (l: LotOption) => {
              const days = daysUntilExpiry(l.expiryDate)
              const expTag = days == null ? "" : days < 0 ? " · EXPIRED" : days <= 30 ? ` · ${days}d left` : ""
              const recvTag = l.receivedDate ? ` · rec ${l.receivedDate}` : ""
              return `${l.lotNo} — ${l.onHand.toLocaleString()} on hand${recvTag}${expTag}`
            }
            const allocatedTotal = allocations.reduce((s, a) => s + (Number(a.qty) || 0), 0)
            const remainingSplit = (Number(qty) || 0) - allocatedTotal

            return (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground">Lot / Batch</label>
                  <div className="flex items-center gap-2 text-[11px]">
                    {lotsLoading && <span className="text-muted-foreground">Loading…</span>}
                    <label className="inline-flex items-center gap-1 cursor-pointer select-none text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={splitMode}
                        onChange={(e) => { setSplitMode(e.target.checked); setError(null) }}
                        className="h-3.5 w-3.5 rounded border-border text-primary"
                      />
                      Split across lots
                    </label>
                  </div>
                </div>

                {!splitMode ? (
                  <>
                    <select
                      value={lotId}
                      onChange={(e) => { setLotId(e.target.value); setError(null) }}
                      className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">Auto (FEFO — earliest expiry)</option>
                      {sortedLots.map((l) => <option key={l.id} value={l.id}>{lotOptionLabel(l)}</option>)}
                    </select>
                    {pickedLot ? (
                      <div className="rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[11px] leading-relaxed">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-bold">{pickedLot.lotNo}</span>
                          <span className="text-muted-foreground">On hand: <span className="font-mono font-semibold text-foreground">{pickedLot.onHand.toLocaleString()}</span></span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                          {pickedLot.receivedDate && <span>Received {pickedLot.receivedDate}</span>}
                          {pickedLot.expiryDate && (() => {
                            const d = daysUntilExpiry(pickedLot.expiryDate)!
                            const tone = d < 0 ? "text-destructive font-semibold" : d <= 30 ? "text-amber-600 dark:text-amber-400 font-semibold" : ""
                            return <span className={tone}>Expires {pickedLot.expiryDate}{d < 0 ? ` (expired ${-d}d ago)` : d <= 30 ? ` (${d}d left)` : ""}</span>
                          })()}
                          {pickedLot.supplierName && <span>From {pickedLot.supplierName}</span>}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Auto uses FEFO — earliest expiry lot first, oldest received as tiebreaker.</p>
                    )}
                  </>
                ) : (
                  <div className="space-y-1.5">
                    <div className="rounded-md border border-border bg-background overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px] border-b border-border">
                          <tr>
                            <th className="px-2 py-1.5 text-left font-semibold">Lot</th>
                            <th className="px-2 py-1.5 text-right font-semibold w-20">Qty</th>
                            <th className="w-8"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {allocations.map((a, i) => {
                            const lot = lots.find((l) => l.id === a.lotId)
                            return (
                              <tr key={i}>
                                <td className="px-2 py-1.5">
                                  <select
                                    value={a.lotId}
                                    onChange={(e) => {
                                      setAllocations((prev) => prev.map((x, idx) => idx === i ? { ...x, lotId: e.target.value } : x))
                                      setError(null)
                                    }}
                                    className="w-full h-7 rounded border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                                  >
                                    <option value="">— Select lot —</option>
                                    {sortedLots
                                      .filter((l) => l.id === a.lotId || !allocations.some((x, idx) => idx !== i && x.lotId === l.id))
                                      .map((l) => <option key={l.id} value={l.id}>{lotOptionLabel(l)}</option>)}
                                  </select>
                                </td>
                                <td className="px-2 py-1.5">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={lot?.onHand}
                                    value={a.qty}
                                    onChange={(e) => {
                                      setAllocations((prev) => prev.map((x, idx) => idx === i ? { ...x, qty: e.target.value } : x))
                                      setError(null)
                                    }}
                                    className="h-7 text-xs text-right font-mono"
                                    placeholder="0"
                                    inputMode="numeric"
                                  />
                                </td>
                                <td className="px-1 py-1.5 text-right">
                                  {allocations.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => setAllocations((prev) => prev.filter((_, idx) => idx !== i))}
                                      className="text-muted-foreground/60 hover:text-destructive text-xs px-1"
                                      title="Remove row"
                                    >
                                      ✕
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                      <div className="flex items-center justify-between border-t border-border bg-muted/10 px-2 py-1.5">
                        <button
                          type="button"
                          onClick={() => setAllocations((prev) => [...prev, { lotId: "", qty: "" }])}
                          disabled={allocations.length >= lots.length}
                          className="text-[11px] font-semibold text-primary hover:underline disabled:opacity-40 disabled:no-underline"
                        >
                          + Add lot row
                        </button>
                        <div className="text-[11px] font-mono text-muted-foreground">
                          Allocated: <span className="font-bold text-foreground">{allocatedTotal.toLocaleString()}</span>
                          {qty && (
                            <span className={remainingSplit === 0 ? "text-emerald-600 dark:text-emerald-400" : remainingSplit < 0 ? "text-destructive" : ""}>
                              {" "}/ {Number(qty).toLocaleString()}
                              {remainingSplit !== 0 && ` (${remainingSplit > 0 ? "+" : ""}${(-remainingSplit).toLocaleString()} to go)`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Each row consumes from that lot's on-hand at the current location. Sum must equal the total qty.</p>
                  </div>
                )}
              </div>
            )
          })()}

          {isIn && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Supplier (source)</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">— Select supplier —</option>
                {SUPPLIERS.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Quantity</label>
            <Input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => { setQty(e.target.value); setError(null) }}
              placeholder="e.g. 2000"
            />
          </div>

          {isIn && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Lot / Batch No.</label>
                {/* Scanner-ready — the `data-scannable` hook + off-autocorrect
                    lets a future keyboard-wedge / handheld reader route its
                    payload here without a form-value collision. */}
                <Input
                  value={lotNo}
                  onChange={(e) => setLotNo(e.target.value)}
                  placeholder="blank → auto · scan or type"
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="characters"
                  enterKeyHint="next"
                  data-scannable="lot"
                  name="lot-no"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Expiry (optional)</label>
                <Input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  data-scannable="expiry"
                  name="expiry"
                />
              </div>
            </div>
          )}

          {isIn && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Destination location (optional)</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">Default bin (bulk)</option>
                {binGroups.map((g) => (
                  <optgroup key={g.warehouse} label={g.warehouse}>
                    {g.bins.map((b) => (
                      <option key={b.id} value={b.id}>{b.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">Leave as default to receive into the bulk bin; pick a bin to slot it directly.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Note (optional)</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reference or reason" />
          </div>

          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit}>{isIn ? "Add stock" : "Remove stock"}</Button>
        </div>
      </div>
    </div>
  )
}
