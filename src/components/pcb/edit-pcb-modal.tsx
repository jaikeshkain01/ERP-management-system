"use client"

import * as React from "react"
import { X, CircuitBoard, AlertCircle } from "lucide-react"
import { PcbForm, type ManualPcbData, type ManualLine } from "@/components/pcb/pcb-form"
import { useData } from "@/lib/data-provider"

type Props = {
  /** PCB slug/id to edit. */
  pcbId: string
  onClose: () => void
  onSaved?: () => void
}

/** Edit a PCB in a modal dialog — same form/layout as Add PCB, pre-filled. */
export function EditPcbModal({ pcbId, onClose, onSaved }: Props) {
  const d = useData()
  const pcb = d.PCBS.find((p) => p.id === pcbId)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const initialLines: ManualLine[] = React.useMemo(
    () =>
      pcb
        ? d.pcbBom(pcb).map((bl) => ({
            componentId: bl.component.genericPN,
            type: bl.component.category,
            name: bl.component.name,
            partNumber: bl.component.genericPN,
            solderType: bl.component.solderType,
            footprint: bl.component.footprint,
            qty: String(bl.qty),
          }))
        : [],
    [pcb, d],
  )

  const handleSubmit = async (data: ManualPcbData) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/pcbs/${encodeURIComponent(pcbId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          name: data.name,
          description: data.description || null,
          layers: data.layers ?? null,
          status: data.status,
          lines: data.lines.map((l) => ({
            componentId: l.componentId,
            name: l.name || undefined,
            partNumber: l.partNumber || undefined,
            type: l.type || undefined,
            solderType: l.solderType === "SMD" || l.solderType === "DIP" ? l.solderType : undefined,
            footprint: l.footprint || undefined,
            qty: l.qty,
          })),
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error?.message ?? "Failed to update PCB")
        setBusy(false)
        return
      }
      await d.reload()
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update PCB")
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      onClick={() => !busy && onClose()}
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
              <h3 className="text-sm font-bold">{pcb ? `Edit PCB — ${pcb.name}` : "Edit PCB"}</h3>
              <p className="text-xs text-muted-foreground">Update the board&apos;s identity and its bill of materials.</p>
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

        {/* Body — shared form, pre-filled */}
        <div className="px-5 py-5 overflow-y-auto overflow-x-visible">
          {!pcb ? (
            <div className="py-8 text-center text-sm text-muted-foreground">PCB not found. It may have been deleted.</div>
          ) : (
            <>
              {error && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="font-medium">{error}</span>
                </div>
              )}
              <PcbForm
                initial={{
                  name: pcb.name,
                  description: pcb.description,
                  layers: pcb.layers ? String(pcb.layers) : "",
                  status: pcb.status,
                  lines: initialLines,
                }}
                submitLabel="Save Changes"
                busy={busy}
                onSubmit={handleSubmit}
                onCancel={onClose}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
