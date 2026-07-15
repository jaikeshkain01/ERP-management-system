/**
 * GET  /api/pcbs — list PCBs with BOM totals + used-in (`pcb.view`).
 * POST /api/pcbs — create a standalone PCB (board + Active revision + BOM lines);
 *   each line links an existing component (by generic_pn) or creates one (`pcb.create`).
 */
import { z } from "zod";
import { created, handle, ok, parseJson } from "@/lib/server/http";
import { createPcb, listPcbs } from "@/lib/server/data/pcbs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(await listPcbs()));
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

const Body = z.object({
  name: z.string().trim().min(1),
  description: z.string().max(2000).optional(),
  layers: z.number().int().positive().optional(),
  status: z.enum(["Active", "Prototype", "Deprecated"]).optional(),
  lines: z.array(Line).min(1),
});

export async function POST(req: Request) {
  return handle(async () => created(await createPcb(await parseJson(req, Body))));
}
