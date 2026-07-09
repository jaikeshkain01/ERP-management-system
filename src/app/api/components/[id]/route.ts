/**
 * PATCH /api/components/[id] — edit a component's own fields (`component.edit`).
 * `[id]` accepts a uuid or generic_pn. Changing generic_pn must stay unique (409).
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { updateComponent } from "@/lib/server/data/components";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  genericPN: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  category: z.string().max(120).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  unit: z.string().trim().min(1).optional(),
  solderType: z.enum(["SMD", "DIP"]).nullable().optional(),
  footprint: z.string().max(120).nullable().optional(),
  spq: z.number().int().positive().nullable().optional(),
  minStock: z.number().nonnegative().optional(),
  reorderQty: z.number().nonnegative().optional(),
  specs: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await updateComponent(id, await parseJson(req, PatchBody)));
  });
}
