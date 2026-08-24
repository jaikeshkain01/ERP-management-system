/**
 * Legacy /components/add — retired at P10 in favour of the universal
 * /items/add form. This module preserves the URL so old bookmarks and
 * in-flight nav links keep working; a fresh render immediately redirects.
 *
 * The legacy form component (`@/app/components/component-form`) is still
 * used by /components/edit and stays around; only this add entrypoint is
 * gone.
 */
import { redirect } from "next/navigation"

export default function AddComponentPage() {
  redirect("/items/add")
}
