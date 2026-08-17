"use client"

import * as React from "react"
import { X, Plus, Trash2, PencilRuler, AlertCircle, Link2, Sparkles, CircuitBoard, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useData } from "@/lib/data-provider"
import type { ImportedBomLine } from "@/lib/bom-import"

interface ManualLine {
  /** generic_pn of a linked catalog component; empty ⇒ a new part to be created. */
  componentId: string
  type: string
  name: string
  partNumber: string
  solderType: string
  footprint: string
  qty: string
}

interface ManualPcb {
  name: string
  /** Boards of this type per product unit. */
  qty: string
  lines: ManualLine[]
  /** Linked catalog PCB id — set when user picks a PCB from the typeahead. */
  linkedPcbId?: string
}

/** A manual BOM line — superset of ImportedBomLine plus the catalog link. */
export interface ManualLineData extends ImportedBomLine {
  /** generic_pn of the linked catalog component, if the user picked an existing one. */
  componentId?: string
}

export interface ManualPcbData {
  name: string
  qty: number
  lines: ManualLineData[]
  /** If this PCB was picked from the catalog typeahead, its catalog id. */
  linkedPcbId?: string
}

export interface ManualProductData {
  name: string
  code: string
  description: string
  versionLabel: string
  /** All component lines flattened (used by the "add version" / custom-product path). */
  lines: ManualLineData[]
  /** Components grouped into PCBs (used by the catalog "create product" path). */
  pcbs: ManualPcbData[]
}

type Props = {
  /** "product" collects product identity + PCBs; "version" only a flat labelled BOM. */
  mode?: "product" | "version"
  defaultVersionLabel?: string
  onApply: (data: ManualProductData) => void
  onClose: () => void
}

const emptyLine = (): ManualLine => ({
  componentId: "",
  type: "",
  name: "",
  partNumber: "",
  solderType: "SMD",
  footprint: "",
  qty: "1",
})

const emptyPcb = (name = ""): ManualPcb => ({ name, qty: "1", lines: [emptyLine(), emptyLine()] })

export function AddProductModal({ mode = "product", defaultVersionLabel = "v1", onApply, onClose }: Props) {
  const isProduct = mode === "product"
  const { COMPONENTS, PCBS, pcbBom, getPcb } = useData()
  const [name, setName] = React.useState("")
  const [code, setCode] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [versionLabel, setVersionLabel] = React.useState(defaultVersionLabel)
  // Product mode groups lines under PCBs; version mode uses a single unnamed group.
  const [pcbs, setPcbs] = React.useState<ManualPcb[]>([emptyPcb(isProduct ? "Main Board" : "")])
  const [error, setError] = React.useState<string | null>(null)
  /** Which PCB card's PCB-name typeahead is open (index). */
  const [openPcbRow, setOpenPcbRow] = React.useState<number | null>(null)
  /** Which line's Name typeahead is open, keyed by PCB + line index. */
  const [openRow, setOpenRow] = React.useState<{ p: number; l: number } | null>(null)

  const updatePcb = (p: number, patch: Partial<Omit<ManualPcb, "lines">>) => {
    setPcbs((prev) => prev.map((pcb, idx) => (idx === p ? { ...pcb, ...patch } : pcb)))
    setError(null)
  }
  const addPcb = () => setPcbs((prev) => [...prev, emptyPcb(`Board ${prev.length + 1}`)])

  // ── PCB-name typeahead helpers ──────────────────────────────────────────────
  /** Catalog PCBs matching the current query (by name or id). */
  const pcbMatchesFor = React.useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase()
      if (!q) return PCBS.slice(0, 12)
      return PCBS.filter(
        (p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
      ).slice(0, 12)
    },
    [PCBS],
  )

  /** User picked a catalog PCB → fill its BOM lines into the card. */
  const pickCatalogPcb = (p: number, pcb: (typeof PCBS)[number]) => {
    const bomLines = pcbBom(pcb)
    const filledLines: ManualLine[] = bomLines.map((bl) => ({
      componentId: bl.component.genericPN,
      type: bl.component.category,
      name: bl.component.name,
      partNumber: bl.component.genericPN,
      solderType: bl.component.solderType,
      footprint: bl.component.footprint,
      qty: String(bl.qty),
    }))
    // Always ensure at least one empty line so the user can add more parts.
    if (filledLines.length === 0) filledLines.push(emptyLine())
    setPcbs((prev) =>
      prev.map((card, idx) =>
        idx === p
          ? { ...card, name: pcb.name, linkedPcbId: pcb.id, lines: filledLines }
          : card,
      ),
    )
    setOpenPcbRow(null)
    setError(null)
  }

  /** Typing in PCB Name: update text and drop any prior catalog link. */
  const onPcbNameChange = (p: number, value: string) => {
    updatePcb(p, { name: value, linkedPcbId: undefined } as Partial<Omit<ManualPcb, "lines">>)
    setOpenPcbRow(value.trim() ? p : null)
  }
  const removePcb = (p: number) => setPcbs((prev) => prev.filter((_, idx) => idx !== p))

  const updateLine = (p: number, l: number, patch: Partial<ManualLine>) => {
    setPcbs((prev) =>
      prev.map((pcb, pi) =>
        pi === p ? { ...pcb, lines: pcb.lines.map((ln, li) => (li === l ? { ...ln, ...patch } : ln)) } : pcb,
      ),
    )
    setError(null)
  }
  const addLine = (p: number) =>
    setPcbs((prev) => prev.map((pcb, pi) => (pi === p ? { ...pcb, lines: [...pcb.lines, emptyLine()] } : pcb)))
  const removeLine = (p: number, l: number) =>
    setPcbs((prev) =>
      prev.map((pcb, pi) => (pi === p ? { ...pcb, lines: pcb.lines.filter((_, li) => li !== l) } : pcb)),
    )

  /** Catalog matches for a row's Name query (by name or generic PN). Empty query ⇒ none. */
  const matchesFor = React.useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase()
      if (!q) return []
      return COMPONENTS.filter(
        (c) => c.name.toLowerCase().includes(q) || c.genericPN.toLowerCase().includes(q),
      ).slice(0, 8)
    },
    [COMPONENTS],
  )

  /** User picked an existing catalog component → fill the row and record the link. */
  const pickComponent = (p: number, l: number, c: (typeof COMPONENTS)[number]) => {
    updateLine(p, l, {
      componentId: c.genericPN,
      name: c.name,
      partNumber: c.genericPN,
      type: c.category,
      solderType: c.solderType,
      footprint: c.footprint,
    })
    setOpenRow(null)
  }

  /** Typing in Name: update text and drop any prior catalog link (now a free/new part). */
  const onNameChange = (p: number, l: number, value: string) => {
    updateLine(p, l, { name: value, componentId: "" })
    setOpenRow(value.trim() ? { p, l } : null)
  }

  const toLineData = (l: ManualLine): ManualLineData => ({
    type: l.type.trim(),
    name: l.name.trim(),
    partNumber: l.partNumber.trim(),
    solderType: l.solderType.trim(),
    footprint: l.footprint.trim(),
    qty: Math.max(0, Math.round(Number(l.qty) || 0)) || 1,
    manufacturer: "",
    supplier: "",
    reference: "",
    componentId: l.componentId.trim() || undefined,
  })

  const submit = () => {
    if (isProduct && !name.trim()) return setError("Enter a product name.")
    if (!versionLabel.trim()) return setError("Enter a BOM version label.")

    const groups: ManualPcbData[] = pcbs
      .map((pcb) => ({
        name: pcb.name.trim(),
        qty: Math.max(1, Math.round(Number(pcb.qty) || 1)),
        lines: pcb.lines.filter((l) => l.name.trim() || l.partNumber.trim()).map(toLineData),
        linkedPcbId: pcb.linkedPcbId || undefined,
      }))
      .filter((g) => g.lines.length > 0)

    if (groups.length === 0) return setError("Add at least one item line (Name or Part Number).")
    if (isProduct && groups.some((g) => !g.name)) return setError("Give every PCB a name.")

    onApply({
      name: name.trim(),
      code: code.trim(),
      description: description.trim(),
      versionLabel: versionLabel.trim(),
      lines: groups.flatMap((g) => g.lines),
      pcbs: groups,
    })
  }

  const renderLinesTable = (p: number, pcb: ManualPcb) => (
    <div className="border border-border rounded-lg">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/40 text-muted-foreground border-b border-border text-[10px] uppercase font-bold">
          <tr>
            <th className="px-2 py-2 w-24">Type</th>
            <th className="px-2 py-2 min-w-[180px]">Name</th>
            <th className="px-2 py-2 w-32">Part Number</th>
            <th className="px-2 py-2 w-20">Solder</th>
            <th className="px-2 py-2 w-24">Footprint</th>
            <th className="px-2 py-2 w-14 text-center">Qty</th>
            <th className="px-2 py-2 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {pcb.lines.map((l, i) => {
            const linked = !!l.componentId
            const matches = openRow?.p === p && openRow?.l === i ? matchesFor(l.name) : []
            return (
              <tr key={i} className="hover:bg-muted/10">
                <td className="px-2 py-1.5">
                  <Input value={l.type} onChange={(e) => updateLine(p, i, { type: e.target.value })} placeholder="Capacitor" className="h-8 text-xs" disabled={linked} />
                </td>
                <td className="px-2 py-1.5">
                  <div className="relative">
                    <div className="relative">
                      <Input
                        value={l.name}
                        onChange={(e) => onNameChange(p, i, e.target.value)}
                        onFocus={() => { if (l.name.trim() && !linked) setOpenRow({ p, l: i }) }}
                        onBlur={() => setTimeout(() => setOpenRow((r) => (r && r.p === p && r.l === i ? null : r)), 150)}
                        placeholder="Search catalog or type a new part…"
                        className={`h-8 text-xs ${linked ? "pr-7" : ""}`}
                        autoComplete="off"
                      />
                      {linked && (
                        <Link2 className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-500" />
                      )}
                    </div>
                    {matches.length > 0 && (
                      <ul className="absolute left-0 top-[calc(100%+2px)] z-50 max-h-56 w-[min(320px,80vw)] overflow-y-auto rounded-lg border border-border bg-popover shadow-xl">
                        {matches.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); pickComponent(p, i, c) }}
                              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-muted/60"
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{c.name}</span>
                                <span className="block truncate text-[10px] text-muted-foreground">
                                  {c.genericPN} · {c.category || "—"}
                                </span>
                              </span>
                              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                                {c.stock} in stock
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {!linked && l.name.trim() && (
                      <span className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-500">
                        <Sparkles className="h-3 w-3" /> New part — will be created
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <Input value={l.partNumber} onChange={(e) => updateLine(p, i, { partNumber: e.target.value })} placeholder="MPN" className="h-8 text-xs" disabled={linked} />
                </td>
                <td className="px-2 py-1.5">
                  <select
                    value={l.solderType}
                    onChange={(e) => updateLine(p, i, { solderType: e.target.value })}
                    disabled={linked}
                    className="h-8 w-full rounded-md border border-border bg-background px-1.5 text-xs outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                  >
                    <option value="SMD">SMD</option>
                    <option value="DIP">DIP</option>
                    <option value="">—</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <Input value={l.footprint} onChange={(e) => updateLine(p, i, { footprint: e.target.value })} placeholder="C0603" className="h-8 text-xs" disabled={linked} />
                </td>
                <td className="px-2 py-1.5">
                  <Input type="number" min={1} value={l.qty} onChange={(e) => updateLine(p, i, { qty: e.target.value })} className="h-8 text-xs text-center" />
                </td>
                <td className="px-1 py-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => removeLine(p, i)}
                    aria-label="Remove line"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            )
          })}
          {pcb.lines.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                No lines. Click “Add Line”.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PencilRuler className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">
                {isProduct ? "Add Product Manually" : "Add BOM Version Manually"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isProduct
                  ? "Define one or more PCBs, each with its items — search the catalog to link real parts, new ones are created automatically."
                  : "Enter a new labelled bill of materials for this product."}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-5 py-5 overflow-y-auto overflow-x-visible">
          {isProduct && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Product Name *
                </label>
                <Input value={name} onChange={(e) => { setName(e.target.value); setError(null) }} placeholder="e.g. RoIP 400 Gateway" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Code
                </label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. ROIP400" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Version Label
                </label>
                <Input value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="v1" />
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Description
                </label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description of the product" />
              </div>
            </div>
          )}

          {!isProduct && (
            <div className="space-y-1.5 max-w-xs">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Version Label
              </label>
              <Input value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="e.g. v2, Rev B" />
            </div>
          )}

          {/* Version mode: a single flat BOM. Product mode: one card per PCB. */}
          {!isProduct ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-muted-foreground/70 tracking-wider">
                  Bill of Materials
                </span>
                <Button type="button" variant="outline" size="sm" onClick={() => addLine(0)} className="gap-1 border-border font-bold">
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Line</span>
                </Button>
              </div>
              {renderLinesTable(0, pcbs[0])}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-muted-foreground/70 tracking-wider">
                  PCBs &amp; Items
                </span>
                <Button type="button" variant="outline" size="sm" onClick={addPcb} className="gap-1 border-border font-bold">
                  <CircuitBoard className="h-3.5 w-3.5" />
                  <span>Add PCB</span>
                </Button>
              </div>

              {pcbs.map((pcb, p) => (
                <div key={p} className="rounded-lg border border-border bg-muted/10">
                  <div className="flex flex-wrap items-end gap-3 border-b border-border px-3 py-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <CircuitBoard className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-[180px] flex-1 space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        PCB Name *
                      </label>
                      <div className="relative">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                          <Input
                            value={pcb.name}
                            onChange={(e) => onPcbNameChange(p, e.target.value)}
                            onFocus={() => { if (!pcb.linkedPcbId) setOpenPcbRow(p) }}
                            onBlur={() => setTimeout(() => setOpenPcbRow((r) => (r === p ? null : r)), 150)}
                            placeholder="Search catalog PCBs or type a new name…"
                            className={`h-8 text-xs pl-7 ${pcb.linkedPcbId ? "pr-7" : ""}`}
                            autoComplete="off"
                          />
                          {pcb.linkedPcbId && (
                            <Link2 className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-500" />
                          )}
                        </div>
                        {/* Typeahead dropdown */}
                        {openPcbRow === p && (() => {
                          const pcbMatches = pcbMatchesFor(pcb.name)
                          return pcbMatches.length > 0 ? (
                            <ul className="absolute left-0 top-[calc(100%+2px)] z-50 max-h-64 w-[min(360px,80vw)] overflow-y-auto rounded-lg border border-border bg-popover shadow-xl">
                              {pcbMatches.map((cp) => (
                                <li key={cp.id}>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => { e.preventDefault(); pickCatalogPcb(p, cp) }}
                                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/60 transition-colors"
                                  >
                                    <span className="min-w-0 flex items-center gap-2">
                                      <CircuitBoard className="h-4 w-4 shrink-0 text-primary/70" />
                                      <span>
                                        <span className="block truncate font-medium text-sm">{cp.name}</span>
                                        <span className="block truncate text-[10px] text-muted-foreground">
                                          {cp.id} · {cp.layers}L · {cp.componentsCount} item{cp.componentsCount !== 1 ? "s" : ""}
                                        </span>
                                      </span>
                                    </span>
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                      cp.status === "Active" ? "bg-emerald-500/10 text-emerald-600" :
                                      cp.status === "Prototype" ? "bg-amber-500/10 text-amber-600" :
                                      "bg-muted text-muted-foreground"
                                    }`}>
                                      {cp.status}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null
                        })()}
                        {/* Status hint below the input */}
                        {pcb.linkedPcbId ? (
                          <span className="mt-0.5 flex items-center gap-1 text-[10px] text-emerald-600">
                            <Link2 className="h-3 w-3" /> Linked to catalog PCB — {(() => { const linked = getPcb(pcb.linkedPcbId); return linked ? `${linked.componentsCount} items loaded` : pcb.linkedPcbId })()}
                          </span>
                        ) : pcb.name.trim() ? (
                          <span className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-500">
                            <Sparkles className="h-3 w-3" /> Custom PCB — items entered manually
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="w-24 space-y-1">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Boards / Unit
                      </label>
                      <Input type="number" min={1} value={pcb.qty} onChange={(e) => updatePcb(p, { qty: e.target.value })} className="h-8 text-xs text-center" />
                    </div>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="outline" size="sm" onClick={() => addLine(p)} className="gap-1 border-border font-bold">
                        <Plus className="h-3.5 w-3.5" />
                        <span>Add Line</span>
                      </Button>
                      {pcbs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePcb(p)}
                          aria-label="Remove PCB"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="p-3">{renderLinesTable(p, pcb)}</div>
                </div>
              ))}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground">
            <Link2 className="inline h-3 w-3 text-emerald-500" /> linked to an existing catalog item ·{" "}
            <Sparkles className="inline h-3 w-3 text-amber-500" /> a new item that will be added to the catalog.
          </p>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="font-medium">{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit}>
            {isProduct ? "Create Product" : "Add Version"}
          </Button>
        </div>
      </div>
    </div>
  )
}
