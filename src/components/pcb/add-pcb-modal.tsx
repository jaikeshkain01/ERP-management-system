"use client"

import { X, CircuitBoard } from "lucide-react"
import { PcbForm, type ManualPcbData } from "@/components/pcb/pcb-form"

// Re-exported so existing importers (pcb list page) keep working unchanged.
export type { ManualPcbData, ManualPcbLineData } from "@/components/pcb/pcb-form"

type Props = {
  onApply: (data: ManualPcbData) => void
  onClose: () => void
}

export function AddPcbModal({ onApply, onClose }: Props) {
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
                Define a circuit board and its items — search the catalog to link real parts, new ones are created automatically.
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

        {/* Body — shared form */}
        <div className="px-5 py-5 overflow-y-auto overflow-x-visible">
          <PcbForm submitLabel="Create PCB" onSubmit={onApply} onCancel={onClose} />
        </div>
      </div>
    </div>
  )
}
