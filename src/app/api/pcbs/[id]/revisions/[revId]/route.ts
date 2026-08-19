/**
 * PATCH  /api/pcbs/[id]/revisions/[revId] — rename revision / change status
 *   (promoting to Active demotes any prior Active) / effective dates. (`pcb.edit`)
 * DELETE /api/pcbs/[id]/revisions/[revId] — soft-delete a revision (`pcb.edit`).
 *   Blocked when a product pins to it, or when it's the last revision of the PCB.
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { deletePcbRevision, updatePcbRevision } from "@/lib/server/data/pcbs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Line = z.object({
  componentId: z.string().trim().min(1).optional(),
  name: z.string().trim().optional(),
  partNumber: z.string().trim().optional(),
  type: z.string().trim().optional(),
  solderType: z.enum(["SMD", "DIP"]).optional(),
  footprint: z.string().trim().optional(),
  qty: z.number().int().positive().default(1),
});

const PatchBody = z.object({
  rev: z.string().trim().min(1).optional(),
  status: z.enum(["Draft", "Active", "Superseded", "Obsolete"]).optional(),
  effectiveFrom: z.string().nullable().optional(),
  effectiveTo: z.string().nullable().optional(),
  lines: z.array(Line).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; revId: string }> }) {
  return handle(async () => {
    const { id, revId } = await params;
    return ok(await updatePcbRevision(id, revId, await parseJson(req, PatchBody)));
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; revId: string }> }) {
  return handle(async () => {
    const { id, revId } = await params;
    return ok(await deletePcbRevision(id, revId));
  });
}
