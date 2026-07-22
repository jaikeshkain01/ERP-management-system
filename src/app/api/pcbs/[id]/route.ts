/**
 * GET    /api/pcbs/[id] — PCB detail by uuid or slug.
 * PATCH  /api/pcbs/[id] — edit a PCB's own fields (`pcb.edit`).
 * DELETE /api/pcbs/[id] — soft-delete a PCB (`pcb.delete`; 409 if used in a product).
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { deletePcb, getPcbDetail, updatePcb } from "@/lib/server/data/pcbs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await getPcbDetail(id));
  });
}

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
  name: z.string().trim().min(1).optional(),
  description: z.string().max(2000).nullable().optional(),
  layers: z.number().int().positive().nullable().optional(),
  status: z.enum(["Active", "Prototype", "Deprecated"]).optional(),
  /** When present, replaces the PCB's BOM (active revision lines). */
  lines: z.array(Line).min(1).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await updatePcb(id, await parseJson(req, PatchBody)));
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await deletePcb(id));
  });
}
