"use client"

/**
 * Client-side store for user-created products — those added by importing a BOM
 * spreadsheet or entered manually, as opposed to the catalog products served by
 * /api/bootstrap.
 *
 * A product can hold MANY BOM versions (e.g. "v1", "Rev B", …); one is active at
 * a time and drives the Product Structure view. State is kept in a React context
 * backed by localStorage so products survive navigation and reloads.
 */
import * as React from "react"
import type { ImportedBomLine } from "@/lib/bom-import"

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
  addProduct: (input: NewProductInput) => UserProduct
  addVersion: (productId: string, input: NewVersionInput) => BomVersion | undefined
  setActiveVersion: (productId: string, versionId: string) => void
  removeVersion: (productId: string, versionId: string) => void
  removeProduct: (id: string) => void
  getProduct: (id: string) => UserProduct | undefined
}

const STORAGE_KEY = "erp:user-products"
/** Ids we recognise as user products (incl. the legacy "imported-" prefix). */
export const USER_PRODUCT_PREFIXES = ["cp-", "imported-", "manual-"]
export const isUserProductId = (id: string) =>
  USER_PRODUCT_PREFIXES.some((p) => id.startsWith(p))

const UserProductsContext = React.createContext<Ctx | null>(null)

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "product"
  )
}

// A monotonic-ish token so ids/version-ids stay unique within a session.
let counter = 0
const token = () => {
  counter += 1
  return `${Date.now().toString(36)}${counter.toString(36)}`
}

// Legacy entries (pre-versions) stored { lines, fileName } directly on the product.
type LegacyProduct = Partial<UserProduct> & {
  lines?: ImportedBomLine[]
  fileName?: string
}

function normalize(raw: LegacyProduct): UserProduct | null {
  if (!raw || !raw.id || !raw.name) return null
  if (Array.isArray(raw.versions) && raw.versions.length && raw.activeVersionId) {
    return raw as UserProduct
  }
  // Migrate a legacy single-BOM product into one version.
  const lines = raw.lines ?? []
  const version: BomVersion = {
    id: `v-${token()}`,
    label: "v1",
    source: "import",
    fileName: raw.fileName,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    lines,
  }
  return {
    id: raw.id,
    name: raw.name,
    code: raw.code ?? "",
    description: raw.description ?? `Imported BOM · ${lines.length} components`,
    source: "import",
    versions: [version],
    activeVersionId: version.id,
    createdAt: raw.createdAt ?? new Date().toISOString(),
  }
}

export function UserProductsProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = React.useState<UserProduct[]>([])

  React.useEffect(() => {
    try {
      // Prefer the current key, fall back to the legacy key for a one-time migration.
      const raw =
        localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem("erp:imported-products")
      if (raw) {
        const parsed = JSON.parse(raw) as LegacyProduct[]
        const migrated = parsed.map(normalize).filter((p): p is UserProduct => !!p)
        setProducts(migrated)
      }
    } catch {
      // ignore corrupt storage
    }
  }, [])

  const persist = React.useCallback((next: UserProduct[]) => {
    setProducts(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // storage unavailable — keep working in-memory
    }
  }, [])

  const addProduct = React.useCallback<Ctx["addProduct"]>(
    (input) => {
      const base = `cp-${slugify(input.name)}`
      const existing = new Set(products.map((p) => p.id))
      let id = base
      let n = 2
      while (existing.has(id)) id = `${base}-${n++}`

      const version: BomVersion = {
        id: `v-${token()}`,
        label: input.version.label?.trim() || "v1",
        source: input.version.source,
        fileName: input.version.fileName,
        note: input.version.note,
        createdAt: new Date().toISOString(),
        lines: input.version.lines,
      }
      const product: UserProduct = {
        id,
        name: input.name,
        code: input.code?.trim() || "",
        description:
          input.description?.trim() ||
          `${input.source === "manual" ? "Manually created" : "Imported"} · ${input.version.lines.length} components`,
        source: input.source,
        versions: [version],
        activeVersionId: version.id,
        createdAt: new Date().toISOString(),
      }
      persist([...products, product])
      return product
    },
    [products, persist],
  )

  const addVersion = React.useCallback<Ctx["addVersion"]>(
    (productId, input) => {
      const product = products.find((p) => p.id === productId)
      if (!product) return undefined
      const version: BomVersion = {
        id: `v-${token()}`,
        label: input.label?.trim() || `v${product.versions.length + 1}`,
        source: input.source,
        fileName: input.fileName,
        note: input.note,
        createdAt: new Date().toISOString(),
        lines: input.lines,
      }
      persist(
        products.map((p) =>
          p.id === productId
            ? { ...p, versions: [...p.versions, version], activeVersionId: version.id }
            : p,
        ),
      )
      return version
    },
    [products, persist],
  )

  const setActiveVersion = React.useCallback<Ctx["setActiveVersion"]>(
    (productId, versionId) => {
      persist(
        products.map((p) =>
          p.id === productId && p.versions.some((v) => v.id === versionId)
            ? { ...p, activeVersionId: versionId }
            : p,
        ),
      )
    },
    [products, persist],
  )

  const removeVersion = React.useCallback<Ctx["removeVersion"]>(
    (productId, versionId) => {
      persist(
        products.map((p) => {
          if (p.id !== productId || p.versions.length <= 1) return p
          const versions = p.versions.filter((v) => v.id !== versionId)
          const activeVersionId =
            p.activeVersionId === versionId ? versions[versions.length - 1].id : p.activeVersionId
          return { ...p, versions, activeVersionId }
        }),
      )
    },
    [products, persist],
  )

  const removeProduct = React.useCallback<Ctx["removeProduct"]>(
    (id) => persist(products.filter((p) => p.id !== id)),
    [products, persist],
  )

  const getProduct = React.useCallback(
    (id: string) => products.find((p) => p.id === id),
    [products],
  )

  const value: Ctx = {
    products,
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
