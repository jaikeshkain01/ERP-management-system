/**
 * Legacy /components/details — retired at P13 in favour of
 * /items/details/[id]. This module preserves the URL so old bookmarks and
 * every cross-link that still passes `?component=<uuid>` keep working; the
 * request server-redirects to the new detail page (and forwards the
 * `?from=<workspace>` breadcrumb hint used by cross-workspace nav).
 */
import { redirect } from "next/navigation"

export default async function ComponentsDetailsRedirect(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const sp = await searchParams
  const id = (Array.isArray(sp.component) ? sp.component[0] : sp.component) ?? (Array.isArray(sp.id) ? sp.id[0] : sp.id)
  const from = Array.isArray(sp.from) ? sp.from[0] : sp.from
  if (!id) redirect("/items/list")
  redirect(`/items/details/${encodeURIComponent(id)}${from ? `?from=${encodeURIComponent(from)}` : ""}`)
}
