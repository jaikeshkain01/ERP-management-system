/**
 * Legacy /components/edit — retired at P15c in favour of /items/edit/[id].
 * Server-redirects with `?component=<uuid>` → `/items/edit/<uuid>`. The
 * legacy `component-form.tsx` module is no longer imported by any route;
 * it's still on disk for one release in case a rollback is needed, then
 * gets deleted.
 */
import { redirect } from "next/navigation"

export default async function ComponentsEditRedirect(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const sp = await searchParams
  const id = (Array.isArray(sp.component) ? sp.component[0] : sp.component) ?? (Array.isArray(sp.id) ? sp.id[0] : sp.id)
  redirect(id ? `/items/edit/${encodeURIComponent(id)}` : "/items/list")
}
