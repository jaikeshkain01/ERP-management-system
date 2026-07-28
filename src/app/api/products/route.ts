/**
 * GET  /api/products — list products with counts (`product.view`).
 * POST /api/products — create a catalog product from a flat component list;
 *   each line links an existing component (by generic_pn) or creates one, and the
 *   product gets one auto-generated "Main Board" PCB (`product.create`).
 */
import { z } from "zod";
import { created, handle, ok, parseJson } from "@/lib/server/http";
import { createCatalogProduct, listProducts } from "@/lib/server/data/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(await listProducts()));
}

const Line = z.object({
  componentId: z.string().trim().min(1).optional(),
  name: z.string().trim().optional(),
  partNumber: z.string().trim().optional(),
  type: z.string().trim().optional(),
  solderType: z.enum(["SMD", "DIP"]).optional(),
  footprint: z.string().trim().optional(),
  qty: z.number().int().positive().default(1),
  /** Reference designator(s) → pcb_lines.ref_des. */
  refDes: z.string().trim().optional(),
  /** Manufacturer name → resolved to a brand (pcb_lines.preferred_brand_id). */
  manufacturer: z.string().trim().optional(),
  /** Supplier name → resolved to a supplier record (price link only when priced). */
  supplier: z.string().trim().optional(),
  /** Unit price for the supplier link; a link row is created only when > 0. */
  unitPrice: z.number().nonnegative().optional(),
});

const Pcb = z.object({
  name: z.string().trim().optional(),
  qty: z.number().int().positive().default(1),
  /** If linking to an existing catalog PCB (slug or uuid). */
  linkedPcbId: z.string().trim().optional(),
  lines: z.array(Line).min(1),
});

const Body = z
  .object({
    name: z.string().trim().min(1),
    code: z.string().trim().optional(),
    description: z.string().max(2000).optional(),
    versionLabel: z.string().trim().optional(),
    status: z.enum(["Ready", "Blocked", "Limited"]).optional(),
    // Preferred: components grouped into PCBs. `lines` kept for the flat fallback.
    pcbs: z.array(Pcb).min(1).optional(),
    lines: z.array(Line).min(1).optional(),
  })
  .refine((b) => (b.pcbs?.length ?? 0) > 0 || (b.lines?.length ?? 0) > 0, {
    message: "Provide at least one PCB or component line",
  });

export async function POST(req: Request) {
  return handle(async () => created(await createCatalogProduct(await parseJson(req, Body))));
}
