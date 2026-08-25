"use client"

/**
 * /items/add — thin route wrapper around the shared `<UniversalItemForm />`
 * (see src/components/items/universal-item-form.tsx). The form owns all
 * state, submits to POST /api/items in add mode, and shares the same layout
 * used by /items/edit/[id] in edit mode. Extracted at P15a.
 *
 * The Suspense boundary is required by Next.js because the form uses
 * `useSearchParams()` to honor `?type=` pre-selection from the filtered
 * Semi-assembled / Assembled Products list pages.
 */
import * as React from "react"
import UniversalItemForm from "@/components/items/universal-item-form"

export default function AddUniversalItemPage() {
  return (
    <React.Suspense fallback={null}>
      <UniversalItemForm mode="add" />
    </React.Suspense>
  )
}
