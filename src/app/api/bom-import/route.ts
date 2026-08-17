/**
 * POST /api/bom-import — persist reviewed BOM rows as catalog components
 * (find-or-create with dedup: generic PN → manufacturer PN → new). `component.create`.
 */
import { z } from "zod";
import { created, handle, parseJson } from "@/lib/server/http";
import { importBomComponents } from "@/lib/server/data/components";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  rows: z.array(
    z.object({
      categoryId: z.string().uuid().nullable().optional(),
      name: z.string(),
      genericPN: z.string().optional(),
      mpn: z.string().optional(),
      manufacturer: z.string().optional(),
      solderType: z.string().optional(),
      footprint: z.string().optional(),
    }),
  ),
});

export async function POST(req: Request) {
  return handle(async () => {
    const { rows } = await parseJson(req, Body);
    return created(await importBomComponents(rows));
  });
}
