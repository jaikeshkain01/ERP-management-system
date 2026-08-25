/**
 * Legacy /pcb-management/structure — retired at F6.4 / B4 in favour of the
 * universal BOM editor at /items/[id]/bom. The old URL is preserved so cached
 * links keep working; a fresh render resolves the PCB's Active revision (F2
 * gave every revision an items.id equal to `pcb_revisions.id`), and server-
 * redirects to /items/[id]/bom for that revision. Falls back to /items/list
 * when no revision resolves (unknown slug, deleted PCB).
 */
import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { withTenant } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export default async function PcbStructureRedirect(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const sp = await searchParams;
  const pcbKey = (Array.isArray(sp.pcb) ? sp.pcb[0] : sp.pcb) ?? undefined;
  const session = await getSession();
  if (!session || !session.companyId) redirect("/login");
  if (!pcbKey) redirect("/items/list");

  const looksUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pcbKey);
  const revisionItemId = await withTenant(session, async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT pr.id::text AS id
        FROM pcbs p
        JOIN pcb_revisions pr ON pr.pcb_id = p.id
                             AND pr.deleted_at IS NULL
                             AND pr.status = 'Active'
       WHERE p.deleted_at IS NULL
         AND ${looksUuid ? Prisma.sql`p.id = ${pcbKey}::uuid` : Prisma.sql`p.slug = ${pcbKey}`}
       LIMIT 1`);
    return rows[0]?.id ?? null;
  });

  redirect(revisionItemId ? `/items/${encodeURIComponent(revisionItemId)}/bom` : "/items/list");
}
