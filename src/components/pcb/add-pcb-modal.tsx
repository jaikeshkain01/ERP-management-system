"use client"

import * as React from "react"
import { X, Plus, Trash2, CircuitBoard, AlertCircle, Link2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useData } from "@/lib/data-provider"

type PcbStatus = "Active" | "Prototype" | "Deprecated"

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

/** A single resolved BOM line handed to the caller. */
export interface ManualPcbLineData {
  type: string
  name: string
  partNumber: string
  solderType: string
  footprint: string
  qty: number
  /** generic_pn of the linked catalog component, if the user picked an existing one. */
  componentId?: string
}

export interface ManualPcbData {
  name: string
  description: string
  layers?: number
  status: PcbStatus
  lines: ManualPcbLineData[]
}

type Props = {
  onApply: (data: ManualPcbData) => void
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

export function AddPcbModal({ onApply, onClose }: Props) {
  const { COMPONENTS } = useData()
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [layers, setLayers] = React.useState("2")
  const [status, setStatus] = React.useState<PcbStatus>("Prototype")
  const [lines, setLines] = React.useState<ManualLine[]>([emptyLine(), emptyLine()])
  const [error, setError] = React.useState<string | null>(null)
  /** Which line's Name typeahead is open, by index. */
  const [openRow, setOpenRow] = React.useState<number | null>(null)

  const updateLine = (l: number, patch: Partial<ManualLine>) => {
    setLines((prev) => prev.map((ln, li) => (li === l ? { ...ln, ...patch } : ln)))
    setError(null)
  }
  const addLine = () => setLines((prev) => [...prev, emptyLine()])
  const removeLine = (l: number) => setLines((prev) => prev.filter((_, li) => li !== l))

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
  const pickComponent = (l: number, c: (typeof COMPONENTS)[number]) => {
    updateLine(l, {
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
  const onNameChange = (l: number, value: string) => {
    updateLine(l, { name: value, componentId: "" })
    setOpenRow(value.trim() ? l : null)
  }

  const submit = () => {
    if (!name.trim()) return setError("Enter a PCB name.")

    const bomLines: ManualPcbLineData[] = lines
      .filter((l) => l.name.trim() || l.partNumber.trim())
      .map((l) => ({
        type: l.type.trim(),
        name: l.name.trim(),
        partNumber: l.partNumber.trim(),
        solderType: l.solderType.trim(),
        footprint: l.footprint.trim(),
        qty: Math.max(0, Math.round(Number(l.qty) || 0)) || 1,
        componentId: l.componentId.trim() || undefined,
      }))

    if (bomLines.length === 0) return setError("Add at least one component line (Name or Part Number).")

    const layerNum = Math.round(Number(layers) || 0)
    onApply({
      name: name.trim(),
      description: description.trim(),
      layers: layerNum > 0 ? layerNum : undefined,
      status,
      lines: bomLines,
    })
  }

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
              <CircuitBoard className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Add PCB Manually</h3>
              <p className="text-xs text-muted-foreground">
                Define a circuit board and its components — search the catalog to link real parts, new ones are created automatically.
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
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                PCB Name *
              </label>
              <Input value={name} onChange={(e) => { setName(e.target.value); setError(null) }} placeholder="e.g. RoIP Main Board" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Layers
              </label>
              <Input type="number" min={1} value={layers} onChange={(e) => setLayers(e.target.value)} placeholder="2" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PcbStatus)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="Active">Active</option>
                <option value="Prototype">Prototype</option>
                <option value="Deprecated">Deprecated</option>
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-4">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Description
              </label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description of the board" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-muted-foreground/70 tracking-wider">
                Bill of Materials
              </span>
              <Button type="button" variant="outline" size="sm" onClick={addLine} className="gap-1 border-border font-bold">
                <Plus className="h-3.5 w-3.5" />
                <span>Add Line</span>
              </Button>
            </div>

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
                  {lines.map((l, i) => {
                    const linked = !!l.componentId
                    const matches = openRow === i ? matchesFor(l.name) : []
                    return (
                      <tr key={i} className="hover:bg-muted/10">
                        <td className="px-2 py-1.5">
                          <Input value={l.type} onChange={(e) => updateLine(i, { type: e.target.value })} placeholder="Capacitor" className="h-8 text-xs" disabled={linked} />
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="relative">
                            <div className="relative">
                              <Input
                                value={l.name}
                                onChange={(e) => onNameChange(i, e.target.value)}
                                onFocus={() => { if (l.name.trim() && !linked) setOpenRow(i) }}
                                onBlur={() => setTimeout(() => setOpenRow((r) => (r === i ? null : r)), 150)}
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
                                      onMouseDown={(e) => { e.preventDefault(); pickComponent(i, c) }}
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
                          <Input value={l.partNumber} onChange={(e) => updateLine(i, { partNumber: e.target.value })} placeholder="MPN" className="h-8 text-xs" disabled={linked} />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={l.solderType}
                            onChange={(e) => updateLine(i, { solderType: e.target.value })}
                            disabled={linked}
                            className="h-8 w-full rounded-md border border-border bg-background px-1.5 text-xs outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                          >
                            <option value="SMD">SMD</option>
                            <option value="DIP">DIP</option>
                            <option value="">—</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <Input value={l.footprint} onChange={(e) => updateLine(i, { footprint: e.target.value })} placeholder="C0603" className="h-8 text-xs" disabled={linked} />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input type="number" min={1} value={l.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} className="h-8 text-xs text-center" />
                        </td>
                        <td className="px-1 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => removeLine(i)}
                            aria-label="Remove line"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                        No lines. Click “Add Line”.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground">
            <Link2 className="inline h-3 w-3 text-emerald-500" /> linked to an existing catalog component ·{" "}
            <Sparkles className="inline h-3 w-3 text-amber-500" /> a new component that will be added to the catalog.
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
            Create PCB
          </Button>
        </div>
      </div>
    </div>
  )
}
