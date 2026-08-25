/**
 * Legacy /components/add — retired at P10 in favour of the universal
 * /items/add form. This module preserves the URL so old bookmarks and
 * in-flight nav links keep working; a fresh render immediately redirects.
 *
 * The legacy `component-form.tsx` was deleted in the F5.6 cleanup pass
 * (no importers remained after P15c retired /components/edit).
 */
import { redirect } from "next/navigation"

export default function AddComponentPage() {
  redirect("/items/add")
}
