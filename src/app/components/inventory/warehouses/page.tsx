"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Warehouse, MapPin, Plus, Pencil, Trash2, X, Check, AlertCircle, Star, Boxes } from "lucide-react"
import { extractError } from "@/lib/api-error"

interface WarehouseRow {
  id: string
  code: string
  name: string
  location: string | null
  isFinishedGoods: boolean
}
interface LocationRow {
  id: string
  warehouseId: string
  parentId: string | null
  kind: string
  code: string
  name: string | null
  isDefault: boolean
}

const KINDS = ["zone", "rack", "bin"] as const

type Modal =
  | { type: "wh-add" }
  | { type: "wh-edit"; wh: WarehouseRow }
  | { type: "wh-del"; wh: WarehouseRow }
  | { type: "loc-add" }
  | { type: "loc-edit"; loc: LocationRow }
  | { type: "loc-del"; loc: LocationRow }
  | null

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = React.useState<WarehouseRow[]>([])
  const [selected, setSelected] = React.useState<string | null>(null)
  const [locations, setLocations] = React.useState<LocationRow[]>([])
  const [loaded, setLoaded] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [modal, setModal] = React.useState<Modal>(null)
  const [toast, setToast] = React.useState<{ message: string; hint?: string; type: "success" | "error" } | null>(null)

  const showToast = (msgOrInfo: string | { message: string; hint?: string }, type: "success" | "error" = "success") => {
    const info = typeof msgOrInfo === "string" ? { message: msgOrInfo } : msgOrInfo
    setToast({ ...info, type })
    setTimeout(() => setToast(null), type === "error" ? 6000 : 3000)
  }

  const loadWarehouses = React.useCallback(async () => {
    try {
      const res = await fetch("/api/warehouses", { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (res.ok && body?.data) {
        setWarehouses(body.data)
        setSelected((cur) => cur ?? body.data[0]?.id ?? null)
      }
    } finally {
      setLoaded(true)
    }
  }, [])

  const loadLocations = React.useCallback(async (whId: string) => {
    const res = await fetch(`/api/warehouses/${whId}/locations`, { cache: "no-store" })
    const body = await res.json().catch(() => null)
    setLocations(res.ok && body?.data ? body.data : [])
  }, [])

  React.useEffect(() => { loadWarehouses() }, [loadWarehouses])
  React.useEffect(() => { if (selected) loadLocations(selected) }, [selected, loadLocations])

  const selectedWh = warehouses.find((w) => w.id === selected) ?? null

  // ── warehouse mutations ─────────────────────────────────────────────────
  const saveWarehouse = async (payload: Record<string, unknown>, id?: string) => {
    setBusy(true)
    try {
      const res = await fetch(id ? `/api/warehouses/${id}` : "/api/warehouses", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { showToast(extractError(body, "Failed to save warehouse"), "error"); return }
      setModal(null)
      await loadWarehouses()
      if (!id && body?.data?.id) setSelected(body.data.id)
      showToast(id ? "Warehouse updated" : "Warehouse created")
    } finally { setBusy(false) }
  }

  const deleteWarehouse = async (wh: WarehouseRow) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/warehouses/${wh.id}`, { method: "DELETE" })
      const body = await res.json().catch(() => null)
      if (!res.ok) { showToast(extractError(body, "Failed to delete warehouse"), "error"); return }
      setModal(null)
      if (selected === wh.id) setSelected(null)
      await loadWarehouses()
      showToast(`Warehouse ${wh.code} deleted`)
    } finally { setBusy(false) }
  }

  // ── location mutations ──────────────────────────────────────────────────
  const saveLocation = async (payload: Record<string, unknown>, locId?: string) => {
    if (!selected) return
    setBusy(true)
    try {
      const res = await fetch(
        locId ? `/api/warehouses/${selected}/locations/${locId}` : `/api/warehouses/${selected}/locations`,
        { method: locId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      )
      const body = await res.json().catch(() => null)
      if (!res.ok) { showToast(extractError(body, "Failed to save location"), "error"); return }
      setModal(null)
      await loadLocations(selected)
      showToast(locId ? "Location updated" : "Location added")
    } finally { setBusy(false) }
  }

  const deleteLocation = async (loc: LocationRow) => {
    if (!selected) return
    setBusy(true)
    try {
      const res = await fetch(`/api/warehouses/${selected}/locations/${loc.id}`, { method: "DELETE" })
      const body = await res.json().catch(() => null)
      if (!res.ok) { showToast(extractError(body, "Failed to delete location"), "error"); return }
      setModal(null)
      await loadLocations(selected)
      showToast(`Location ${loc.code} deleted`)
    } finally { setBusy(false) }
  }

  if (!loaded) {
    return <div className="flex h-[400px] items-center justify-center text-muted-foreground text-sm font-medium">Loading warehouses…</div>
  }

  return (
    <div className="space-y-6">
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

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <span>Inventory</span><span>/</span><span className="text-foreground font-medium">Warehouses</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Warehouses &amp; Locations</h1>
          <p className="text-muted-foreground">Configure warehouses and their zone → rack → bin storage tree.</p>
        </div>
        <Button className="gap-2 font-semibold self-start sm:self-auto" onClick={() => setModal({ type: "wh-add" })}>
          <Plus className="h-4 w-4" /><span>Add Warehouse</span>
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 items-start">
        {/* Warehouses list */}
        <Card className="border border-border shadow-sm overflow-hidden">
          <CardHeader className="border-b border-border bg-muted/20 px-5 py-4">
            <div className="flex items-center gap-2"><Warehouse className="h-5 w-5 text-primary" /><CardTitle className="text-base font-bold">Warehouses</CardTitle></div>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-border">
            {warehouses.map((w) => (
              <div
                key={w.id}
                onClick={() => setSelected(w.id)}
                className={`flex items-start justify-between gap-2 px-5 py-3.5 cursor-pointer transition-colors ${selected === w.id ? "bg-primary/5" : "hover:bg-muted/20"}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary">{w.code}</span>
                    {w.isFinishedGoods && <span className="text-[9px] font-bold uppercase bg-emerald-500/10 text-emerald-600 border border-emerald-500/25 rounded px-1.5 py-0.5">FG</span>}
                  </div>
                  <div className="font-semibold text-sm truncate">{w.name}</div>
                  {w.location && <div className="text-[11px] text-muted-foreground truncate">{w.location}</div>}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Edit" onClick={(e) => { e.stopPropagation(); setModal({ type: "wh-edit", wh: w }) }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Delete" onClick={(e) => { e.stopPropagation(); setModal({ type: "wh-del", wh: w }) }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            {warehouses.length === 0 && (
              <div className="px-5 py-10 text-center text-muted-foreground text-sm">
                <Boxes className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />No warehouses yet.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Locations for selected warehouse */}
        <Card className="lg:col-span-2 border border-border shadow-sm overflow-hidden">
          <CardHeader className="border-b border-border bg-muted/20 px-5 py-4 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-bold">{selectedWh ? `Locations — ${selectedWh.code}` : "Locations"}</CardTitle>
            </div>
            {selectedWh && (
              <Button size="sm" className="gap-1.5 font-semibold" onClick={() => setModal({ type: "loc-add" })}>
                <Plus className="h-3.5 w-3.5" /><span>Add Location</span>
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {!selectedWh ? (
              <div className="px-5 py-12 text-center text-muted-foreground text-sm">Select a warehouse to manage its locations.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground text-[11px] uppercase border-b border-border">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Code</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Kind</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Name</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Parent</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {locations.map((l) => (
                    <tr key={l.id} className="hover:bg-muted/10">
                      <td className="px-4 py-2.5 font-mono font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          {l.code}
                          {l.isDefault && <Star className="h-3 w-3 fill-amber-500 text-amber-500" aria-label="Default bin" />}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 capitalize text-muted-foreground">{l.kind}</td>
                      <td className="px-4 py-2.5">{l.name ?? "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{locations.find((p) => p.id === l.parentId)?.code ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Edit" onClick={() => setModal({ type: "loc-edit", loc: l })}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Delete" onClick={() => setModal({ type: "loc-del", loc: l })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {locations.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No locations. Add a zone, rack, or bin.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modals */}
      {modal?.type === "wh-add" && <WarehouseForm title="Add Warehouse" busy={busy} onClose={() => setModal(null)} onSubmit={(p) => saveWarehouse(p)} />}
      {modal?.type === "wh-edit" && <WarehouseForm title="Edit Warehouse" busy={busy} initial={modal.wh} onClose={() => setModal(null)} onSubmit={(p) => saveWarehouse(p, modal.wh.id)} />}
      {modal?.type === "wh-del" && (
        <ConfirmDelete title="Delete Warehouse" busy={busy} onClose={() => setModal(null)} onConfirm={() => deleteWarehouse(modal.wh)}
          body={<>Deleting <strong>{modal.wh.code} — {modal.wh.name}</strong> is blocked if it still holds stock; its empty locations are removed alongside.</>} />
      )}
      {modal?.type === "loc-add" && <LocationForm title="Add Location" busy={busy} locations={locations} onClose={() => setModal(null)} onSubmit={(p) => saveLocation(p)} />}
      {modal?.type === "loc-edit" && <LocationForm title="Edit Location" busy={busy} locations={locations} initial={modal.loc} onClose={() => setModal(null)} onSubmit={(p) => saveLocation(p, modal.loc.id)} />}
      {modal?.type === "loc-del" && (
        <ConfirmDelete title="Delete Location" busy={busy} onClose={() => setModal(null)} onConfirm={() => deleteLocation(modal.loc)}
          body={<>Deleting <strong>{modal.loc.code}</strong> is blocked if it has child locations or still holds stock.</>} />
      )}
    </div>
  )
}

// ── Warehouse form modal ──────────────────────────────────────────────────
function WarehouseForm({ title, initial, busy, onClose, onSubmit }: {
  title: string; initial?: WarehouseRow; busy: boolean; onClose: () => void; onSubmit: (p: Record<string, unknown>) => void
}) {
  const [code, setCode] = React.useState(initial?.code ?? "")
  const [name, setName] = React.useState(initial?.name ?? "")
  const [location, setLocation] = React.useState(initial?.location ?? "")
  const [isFinishedGoods, setFg] = React.useState(initial?.isFinishedGoods ?? false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ code: code.trim(), name: name.trim(), location: location.trim() || null, isFinishedGoods })
  }
  return (
    <ModalShell title={title} onClose={onClose}>
      <form onSubmit={submit} className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Code"><Input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="WH-01" /></Field>
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Main Store" /></Field>
        </div>
        <Field label="Location"><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Bengaluru" /></Field>
        <label className="flex items-center gap-2 text-sm font-medium select-none">
          <input type="checkbox" checked={isFinishedGoods} onChange={(e) => setFg(e.target.checked)} className="h-4 w-4 rounded border-border text-primary" />
          Finished-goods warehouse
        </label>
        <Actions busy={busy} onClose={onClose} submitLabel="Save" />
      </form>
    </ModalShell>
  )
}

// ── Location form modal ───────────────────────────────────────────────────
function LocationForm({ title, initial, locations, busy, onClose, onSubmit }: {
  title: string; initial?: LocationRow; locations: LocationRow[]; busy: boolean; onClose: () => void; onSubmit: (p: Record<string, unknown>) => void
}) {
  const [kind, setKind] = React.useState<string>(initial?.kind ?? "bin")
  const [code, setCode] = React.useState(initial?.code ?? "")
  const [name, setName] = React.useState(initial?.name ?? "")
  const [parentId, setParentId] = React.useState(initial?.parentId ?? "")
  const [isDefault, setDefault] = React.useState(initial?.isDefault ?? false)
  const isEdit = !!initial

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Record<string, unknown> = {
      code: code.trim(), name: name.trim() || null, parentId: parentId || null, isDefault: kind === "bin" ? isDefault : false,
    }
    if (!isEdit) payload.kind = kind // kind is immutable on edit
    onSubmit(payload)
  }
  // A node can't be its own parent; parents are the other locations in this warehouse.
  const parentOptions = locations.filter((l) => l.id !== initial?.id)
  return (
    <ModalShell title={title} onClose={onClose}>
      <form onSubmit={submit} className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Kind">
            <select value={kind} onChange={(e) => setKind(e.target.value)} disabled={isEdit}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60">
              {KINDS.map((k) => <option key={k} value={k} className="capitalize">{k}</option>)}
            </select>
          </Field>
          <Field label="Code"><Input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="A12" /></Field>
        </div>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional label" /></Field>
        <Field label="Parent">
          <select value={parentId} onChange={(e) => setParentId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <option value="">— Top level —</option>
            {parentOptions.map((p) => <option key={p.id} value={p.id}>{p.code}{p.name ? ` (${p.name})` : ""}</option>)}
          </select>
        </Field>
        {kind === "bin" && (
          <label className="flex items-center gap-2 text-sm font-medium select-none">
            <input type="checkbox" checked={isDefault} onChange={(e) => setDefault(e.target.checked)} className="h-4 w-4 rounded border-border text-primary" />
            Default bin (bulk putaway for un-slotted stock)
          </label>
        )}
        <Actions busy={busy} onClose={onClose} submitLabel="Save" />
      </form>
    </ModalShell>
  )
}

// ── shared bits ───────────────────────────────────────────────────────────
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-4">
          <h3 className="text-base font-extrabold">{title}</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        {children}
      </div>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}
function Actions({ busy, onClose, submitLabel }: { busy: boolean; onClose: () => void; submitLabel: string }) {
  return (
    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
      <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button type="submit" disabled={busy} className="min-w-[100px]">{busy ? "Saving…" : submitLabel}</Button>
    </div>
  )
}
function ConfirmDelete({ title, body, busy, onClose, onConfirm }: {
  title: string; body: React.ReactNode; busy: boolean; onClose: () => void; onConfirm: () => void
}) {
  return (
    <ModalShell title={title} onClose={onClose}>
      <div className="p-5 space-y-4">
        <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/25 p-3 rounded-xl text-destructive text-xs leading-relaxed font-semibold">
          <AlertCircle className="h-5 w-5 shrink-0 text-destructive" /><p>{body}</p>
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="button" onClick={onConfirm} disabled={busy} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold min-w-[100px]">
            {busy ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}
