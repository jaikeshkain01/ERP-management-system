/**
 * POST /api/custom-products/[id]/versions — add a new BOM version (import or
 * manual) to a custom product and make it active (`product.create`).
 */
import { z } from "zod";
import { created, handle, parseJson } from "@/lib/server/http";
import { addCustomVersion } from "@/lib/server/data/custom-products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

const VersionBody = z.object({
  label: z.string().trim().max(80).optional(),
  source: z.enum(["import", "manual"]),
  fileName: z.string().max(300).optional(),
  note: z.string().max(2000).optional(),
  lines: z.array(LineSchema),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return created(await addCustomVersion(id, await parseJson(req, VersionBody)));
  });
}
