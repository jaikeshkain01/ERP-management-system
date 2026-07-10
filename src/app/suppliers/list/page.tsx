"use client"

import * as React from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Truck, Plus, Search, Star, CheckCircle2, ArrowRight, X, Check, AlertCircle, RefreshCw } from "lucide-react"
import { useData } from "@/lib/data-provider"

// A supplier card row — the shape both bootstrap suppliers and freshly-created
// ones are normalised to for rendering.
interface SupplierCard {
  id: string
  name: string
  description: string
  contact: string
  status: string
  rating: number | null
}

export default function SupplierListPage() {
  const { SUPPLIERS } = useData()

  // Suppliers created this session (persisted via POST /api/suppliers) are shown
  // ahead of the bootstrap list until the next full reload re-derives from the DB.
  const [created, setCreated] = React.useState<SupplierCard[]>([])
  const [searchQuery, setSearchQuery] = React.useState("")
  const [isOpen, setIsOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [toast, setToast] = React.useState<{ message: string; type: "success" | "error" } | null>(null)

  // Form state
  const [name, setName] = React.useState("")
  const [contact, setContact] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [status, setStatus] = React.useState<"Active" | "Inactive">("Active")

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const resetForm = () => {
    setName(""); setContact(""); setEmail(""); setPhone(""); setDescription(""); setStatus("Active")
  }

  const suppliers: SupplierCard[] = React.useMemo(() => {
    const base: SupplierCard[] = SUPPLIERS.map((s) => ({
      id: s.id, name: s.name, description: s.description, contact: s.contact, status: s.status, rating: s.rating,
    }))
    return [...created, ...base]
  }, [SUPPLIERS, created])

  const filtered = suppliers.filter((s) => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
  })

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      showToast("Supplier name is required", "error")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          contact: contact.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          description: description.trim() || undefined,
          status,
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        showToast(body?.error?.message || "Failed to create supplier", "error")
        return
      }
      const s = body.data
      setCreated((prev) => [
        {
          id: s.id,
          name: s.name,
          description: s.description ?? "",
          contact: s.contact ?? "",
          status: s.status ?? "Active",
          rating: s.rating ?? null,
        },
        ...prev,
      ])
      resetForm()
      setIsOpen(false)
      showToast(`Supplier "${s.name}" created`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create supplier", "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg transition-all animate-in fade-in slide-in-from-bottom-5 duration-300 ${
          toast.type === "success"
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
            : "bg-destructive/10 border-destructive/20 text-destructive"
        }`}>
          {toast.type === "success" ? <Check className="h-4 w-4 text-emerald-500" /> : <AlertCircle className="h-4 w-4" />}
          <span className="text-sm font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <span>Suppliers</span>
          <span>/</span>
          <span className="text-foreground font-medium">Supplier List</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Supplier List</h1>
        <p className="text-muted-foreground">
          Manage vendor accounts, performance ratings, and material supply channels.
        </p>
      </div>

      {/* Top Controls: Search, Add */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-muted/20 border border-border p-4 rounded-xl">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search suppliers..."
            className="pl-9 bg-background border-border"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          {searchQuery !== "" && (
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" onClick={() => setSearchQuery("")}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
          <Button className="gap-2 font-semibold cursor-pointer" onClick={() => setIsOpen(true)}>
            <Plus className="h-4 w-4" />
            <span>Add Supplier</span>
          </Button>
        </div>
      </div>

      {/* Supplier Cards Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((supplier) => (
          <Card key={supplier.id} className="flex flex-col transition-all duration-300 hover:shadow-lg hover:border-primary/20 group">
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Truck className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg font-bold group-hover:text-primary transition-colors">
                      {supplier.name}
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5 line-clamp-1">
                      {supplier.description || "No description"}
                    </CardDescription>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                  supplier.status === "Active"
                    ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}>
                  <CheckCircle2 className="h-3 w-3" />
                  {supplier.status}
                </span>
              </div>
            </CardHeader>

            <CardContent className="flex-1 py-4 border-t border-b border-border/50 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-medium">Contact Person:</span>
                <span className="font-semibold text-foreground">{supplier.contact || "—"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-medium">Vendor Rating:</span>
                <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  {supplier.rating != null ? `${supplier.rating} / 5.0` : "Not rated"}
                </span>
              </div>
            </CardContent>

            <CardFooter className="pt-4">
              <Button
                render={<Link href={`/suppliers/details?supplier=${supplier.id}`} />}
                className="w-full font-semibold group/btn"
                variant="secondary"
              >
                <span>Supplier Details</span>
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
              </Button>
            </CardFooter>
          </Card>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground font-semibold bg-card border border-border rounded-xl">
            No suppliers match your search.
          </div>
        )}
      </div>

      {/* Add Supplier Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border bg-muted/20 px-6 py-4">
              <h3 className="text-lg font-bold text-foreground">Add Supplier</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full border-0 bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form onSubmit={handleAddSupplier} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Supplier Name</label>
                <Input placeholder="e.g. Mouser Electronics" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact Person</label>
                  <Input placeholder="e.g. Jane Doe" value={contact} onChange={(e) => setContact(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as "Active" | "Inactive")}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</label>
                  <Input type="email" placeholder="sales@vendor.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phone</label>
                  <Input placeholder="+91 …" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</label>
                <textarea
                  className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Vendor profile, specialities, terms…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-border/40 pt-4 mt-2">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={saving}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Create Supplier"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
