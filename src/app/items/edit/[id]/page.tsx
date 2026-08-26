"use client"

/**
 * /items/edit/[id] — thin route wrapper that loads one item and hands it to
 * the shared `<UniversalItemForm mode="edit" initial={…} />`. The form owns
 * all state and the PATCH submit; this page is the loader shell. Introduced
 * at P15b as the universal replacement for the legacy /components/edit.
 */
import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AlertCircle, ArrowLeft } from "lucide-react"
import UniversalItemForm, { type UniversalItemInitial } from "@/components/items/universal-item-form"
import { extractError } from "@/lib/api-error"

export default function EditUniversalItemPage() {
  const { id } = useParams<{ id: string }>()
  const [item, setItem] = React.useState<UniversalItemInitial | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true); setError(null)
      try {
        const res = await fetch(`/api/items/${encodeURIComponent(id)}`, { cache: "no-store" })
        const body = await res.json().catch(() => null)
        if (!res.ok) { if (!cancelled) setError(extractError(body, `${res.status} ${res.statusText}`).message); return }
        if (!cancelled) setItem(body?.data as UniversalItemInitial)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load item")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  if (loading) return (
    <div className="pb-12 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Skeleton className="h-72" />
    </div>
  )

  if (error || !item) return (
    <div className="max-w-4xl mx-auto py-16">
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <h1 className="text-2xl font-extrabold text-destructive">Item not found</h1>
          <p className="text-sm text-muted-foreground max-w-md">{error ?? "The item you're trying to edit doesn't exist or has been deleted."}</p>
          <Link href="/items/list" className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold hover:bg-muted/30">
            <ArrowLeft className="h-4 w-4" /> Back to Items
          </Link>
        </CardContent>
      </Card>
    </div>
  )

  return <UniversalItemForm mode="edit" initial={item} />
}
