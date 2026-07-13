"use client"

/**
 * Client store for user-created products — those added by importing a BOM
 * spreadsheet or entered manually, as opposed to the catalog products served by
 * /api/bootstrap.
 *
 * These are now PERSISTED SERVER-SIDE via /api/custom-products (tables
 * custom_products + custom_bom_versions, multi-tenant + RLS) instead of the old
 * per-browser localStorage. The context shape is unchanged, so consuming pages
 * (products/list, products/structure) don't care where the data lives — mutators
 * are just async now and reconcile from the server's authoritative response.
 *
 * A product can hold MANY BOM versions (e.g. "v1", "Rev B", …); one is active at
 * a time and drives the Product Structure view.
 */
import * as React from "react"
import type { ImportedBomLine } from "@/lib/bom-import"
import { useData } from "@/lib/data-provider"

export type BomSource = "import" | "manual"

export interface BomVersion {
  id: string
  label: string
  source: BomSource
  /** Original spreadsheet name, for imported versions. */
  fileName?: string
  note?: string
  createdAt: string
  lines: ImportedBomLine[]
}

export interface UserProduct {
  id: string
  name: string
  code: string
  description: string
  /** How the product was first created. */
  source: BomSource
  versions: BomVersion[]
  activeVersionId: string
  createdAt: string
}

export interface NewVersionInput {
  label?: string
  source: BomSource
  fileName?: string
  note?: string
  lines: ImportedBomLine[]
}

export interface NewProductInput {
  name: string
  code?: string
  description?: string
  source: BomSource
  version: NewVersionInput
}

type Ctx = {
  products: UserProduct[]
  /** True once the initial server fetch has resolved (avoids flashing empty state). */
  loaded: boolean
  addProduct: (input: NewProductInput) => Promise<UserProduct>
  addVersion: (productId: string, input: NewVersionInput) => Promise<BomVersion | undefined>
  setActiveVersion: (productId: string, versionId: string) => Promise<void>
  removeVersion: (productId: string, versionId: string) => Promise<void>
  removeProduct: (id: string) => Promise<void>
  getProduct: (id: string) => UserProduct | undefined
}

/** Ids we recognise as user products (incl. the legacy "imported-" prefix). */
export const USER_PRODUCT_PREFIXES = ["cp-", "imported-", "manual-"]
export const isUserProductId = (id: string) =>
  USER_PRODUCT_PREFIXES.some((p) => id.startsWith(p))

const UserProductsContext = React.createContext<Ctx | null>(null)

// ── API client ────────────────────────────────────────────────────────────────
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  })
  let body: { data?: T; error?: { message?: string } } = {}
  try {
    body = await res.json()
  } catch {
    /* empty/invalid body */
  }
  if (!res.ok) throw new Error(body.error?.message || `Request failed (${res.status})`)
  return body.data as T
}

export function UserProductsProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = React.useState<UserProduct[]>([])
  const [loaded, setLoaded] = React.useState(false)
  // Wait for the session to be established (DataProvider auto dev-logs-in) before
  // hitting the API, otherwise the fetch races the login and 401s.
  const { me } = useData()

  React.useEffect(() => {
    if (!me) return
    let cancelled = false
    ;(async () => {
      try {
        const list = await api<UserProduct[]>("/api/custom-products")
        if (!cancelled) setProducts(list)
      } catch (err) {
        console.error("[user-products] failed to load:", err)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [me])

  // Replace a product in state with the server's authoritative copy.
  const upsert = React.useCallback((p: UserProduct) => {
    setProducts((prev) => {
      const i = prev.findIndex((x) => x.id === p.id)
      if (i === -1) return [p, ...prev]
      const next = prev.slice()
      next[i] = p
      return next
    })
  }, [])

  const addProduct = React.useCallback<Ctx["addProduct"]>(async (input) => {
    const created = await api<UserProduct>("/api/custom-products", {
      method: "POST",
      body: JSON.stringify(input),
    })
    upsert(created)
    return created
  }, [upsert])

  const addVersion = React.useCallback<Ctx["addVersion"]>(async (productId, input) => {
    const updated = await api<UserProduct>(`/api/custom-products/${encodeURIComponent(productId)}/versions`, {
      method: "POST",
      body: JSON.stringify(input),
    })
    upsert(updated)
    return updated.versions.find((v) => v.id === updated.activeVersionId)
  }, [upsert])

  const setActiveVersion = React.useCallback<Ctx["setActiveVersion"]>(async (productId, versionId) => {
    const updated = await api<UserProduct>(`/api/custom-products/${encodeURIComponent(productId)}`, {
      method: "PATCH",
      body: JSON.stringify({ activeVersionId: versionId }),
    })
    upsert(updated)
  }, [upsert])

  const removeVersion = React.useCallback<Ctx["removeVersion"]>(async (productId, versionId) => {
    const updated = await api<UserProduct>(
      `/api/custom-products/${encodeURIComponent(productId)}/versions/${encodeURIComponent(versionId)}`,
      { method: "DELETE" },
    )
    upsert(updated)
  }, [upsert])

  const removeProduct = React.useCallback<Ctx["removeProduct"]>(async (id) => {
    await api<{ id: string }>(`/api/custom-products/${encodeURIComponent(id)}`, { method: "DELETE" })
    setProducts((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const getProduct = React.useCallback(
    (id: string) => products.find((p) => p.id === id),
    [products],
  )

  const value: Ctx = {
    products,
    loaded,
    addProduct,
    addVersion,
    setActiveVersion,
    removeVersion,
    removeProduct,
    getProduct,
  }

  return <UserProductsContext.Provider value={value}>{children}</UserProductsContext.Provider>
}

export function useUserProducts(): Ctx {
  const ctx = React.useContext(UserProductsContext)
  if (!ctx) throw new Error("useUserProducts() must be used within <UserProductsProvider>")
  return ctx
}

/** The currently-active BOM version of a product (falls back to the first). */
export function activeVersionOf(product: UserProduct): BomVersion {
  return product.versions.find((v) => v.id === product.activeVersionId) ?? product.versions[0]
}
