/**
 * Legacy /products/structure — retired at F6.4 / B4 in favour of the
 * universal BOM editor at /items/[id]/bom. The old URL is preserved so cached
 * links keep working; a fresh render resolves the product's items.id (F2 gave
 * every product an items.id equal to `products.id`), and server-redirects to
 * /items/[id]/bom. Falls back to /items/list when no product resolves
 * (unknown slug, user-only local products, deleted rows).
 */
import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { withTenant } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export default async function ProductStructureRedirect(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const sp = await searchParams;
  const productKey = (Array.isArray(sp.product) ? sp.product[0] : sp.product) ?? undefined;
  const session = await getSession();
  if (!session || !session.companyId) redirect("/login");
  if (!productKey) redirect("/items/list");

  const looksUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productKey);
  const productItemId = await withTenant(session, async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id::text AS id FROM products
       WHERE deleted_at IS NULL
         AND ${looksUuid
              ? Prisma.sql`(id = ${productKey}::uuid OR slug = ${productKey} OR code = ${productKey})`
              : Prisma.sql`(slug = ${productKey} OR code = ${productKey})`}
       LIMIT 1`);
    return rows[0]?.id ?? null;
  });

  redirect(productItemId ? `/items/${encodeURIComponent(productItemId)}/bom` : "/items/list");
}
