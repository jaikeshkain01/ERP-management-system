/**
 * GET  /api/custom-products — list the tenant's user-added products (`product.view`).
 * POST /api/custom-products — create one from an imported/manual BOM (`product.create`).
 *
 * "Custom" products are added via Import BOM / Add Manually; their BOM lines are
 * arbitrary free-text part numbers, not catalog components. See
 * src/lib/server/data/custom-products.ts.
 */
import { z } from "zod";
import { created, handle, ok, parseJson } from "@/lib/server/http";
import { createCustomProduct, listCustomProducts } from "@/lib/server/data/custom-products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(await listCustomProducts()));
}

const LineSchema = z.object({
  type: z.string().default(""),
  name: z.string().default(""),
  partNumber: z.string().default(""),
  solderType: z.string().default(""),
  footprint: z.string().default(""),
  qty: z.coerce.number().default(0),
  manufacturer: z.string().default(""),
  supplier: z.string().default(""),
  reference: z.string().default(""),
});

const VersionSchema = z.object({
  label: z.string().trim().max(80).optional(),
  source: z.enum(["import", "manual"]),
  fileName: z.string().max(300).optional(),
  note: z.string().max(2000).optional(),
  lines: z.array(LineSchema),
});

const CreateBody = z.object({
  name: z.string().trim().min(1).max(200),
  code: z.string().max(80).optional(),
  description: z.string().max(2000).optional(),
  source: z.enum(["import", "manual"]),
  version: VersionSchema,
});

export async function POST(req: Request) {
  return handle(async () => created(await createCustomProduct(await parseJson(req, CreateBody))));
}
