"use client"

/**
 * useAssembledItems — fetches `/api/items?itemType=assembled` once and
 * returns the rows shaped as `{id, name, code}` for use in production /
 * planner / orders selectors.
 *
 * Replaces the retired `d.PRODUCTS` projection: the bootstrap no longer
 * carries products, but every consumer that used to iterate them just
 * needs a name-and-id pair to populate a select. Fetching the list on
 * demand keeps the bootstrap payload small.
 */
import * as React from "react"

export interface AssembledItemOption {
  id: string
  code: string
  name: string
}

export function useAssembledItems(): {
  items: AssembledItemOption[]
  loading: boolean
} {
  const [items, setItems] = React.useState<AssembledItemOption[]>([])
  const [loading, setLoading] = React.useState(true)
  React.useEffect(() => {
    let cancelled = false
    fetch("/api/items?itemType=assembled", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { data?: Array<{ id: string; code: string; name: string }> } | null) => {
        if (cancelled || !body?.data) return
        setItems(body.data.map((r) => ({ id: r.id, code: r.code, name: r.name })))
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])
  return { items, loading }
}
