"use client"

/**
 * /items/add — thin route wrapper around the shared `<UniversalItemForm />`
 * (see src/components/items/universal-item-form.tsx). The form owns all
 * state, submits to POST /api/items in add mode, and shares the same layout
 * used by /items/edit/[id] in edit mode. Extracted at P15a.
 */
import UniversalItemForm from "@/components/items/universal-item-form"

export default function AddUniversalItemPage() {
  return <UniversalItemForm mode="add" />
}
