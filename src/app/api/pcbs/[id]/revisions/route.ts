/**
 * GET  /api/pcbs/[id]/revisions — list all revisions of a PCB (`pcb.view`).
 * POST /api/pcbs/[id]/revisions — add a new revision. Setting status=Active
 *   demotes any prior Active revision on this PCB. Populate lines either fresh
 *   or by cloning another revision's BOM via `cloneFromRevId`. (`pcb.edit`)
 */
import { z } from "zod";
import { created, handle, ok, parseJson } from "@/lib/server/http";
import { createPcbRevision, listPcbRevisions } from "@/lib/server/data/pcbs";

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

const Body = z.object({
  rev: z.string().trim().min(1),
  status: z.enum(["Draft", "Active", "Superseded", "Obsolete"]).optional(),
  cloneFromRevId: z.string().uuid().optional(),
  lines: z.array(Line).optional(),
  effectiveFrom: z.string().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await listPcbRevisions(id));
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return created(await createPcbRevision(id, await parseJson(req, Body)));
  });
}
