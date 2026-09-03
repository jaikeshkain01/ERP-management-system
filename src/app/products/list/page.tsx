/**
 * Legacy /products/list — retired at the module-consolidation slice in
 * favour of the universal items master filtered by itemType. The old URL
 * is preserved so bookmarks keep working; every hit server-redirects to
 * /items/list?itemType=assembled.
 *
 * If you're reading this after the follow-up slice, the file can be
 * removed and the products directory nuked — the launchpad and workspace
 * router already point directly at the new URL, and any cached links
 * still land via Next.js' route resolution.
 */
import { redirect } from "next/navigation";

export default function ProductsListRedirect() {
  redirect("/items/list?itemType=assembled");
}
