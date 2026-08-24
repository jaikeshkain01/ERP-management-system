/**
 * Legacy /components/list — retired at P11 in favour of /items/list (which
 * reads the same universal-item master). This module preserves the URL so
 * old bookmarks, external cross-links, and the dashboard's
 * `?component=<uuid>` links keep working; a fresh render maps the query to
 * `?id=<uuid>` and redirects.
 *
 * A server redirect is used (no client-side flash). The item detail panel on
 * /items/list opens automatically when `id` matches a live row.
 */
import { redirect } from "next/navigation"

export default async function ComponentsListRedirect(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const sp = await searchParams
  const id = (Array.isArray(sp.component) ? sp.component[0] : sp.component) ?? (Array.isArray(sp.id) ? sp.id[0] : sp.id)
  redirect(id ? `/items/list?id=${encodeURIComponent(id)}` : "/items/list")
}
