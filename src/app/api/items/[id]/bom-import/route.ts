/**
 * POST /api/items/[id]/bom-import — bulk-ingest spreadsheet rows into a fresh
 * Draft BOM version on the item. Slice B of the BOM importer workstream —
 * the client (Slice C/D) parses the xlsx and POSTs already-mapped rows here.
 *
 * Body: { rows: BomImportRow[], sourceLabel?: string }
 *   • rows — one child per row. `name` and `qty` are required; every other
 *            column is optional. See src/lib/server/data/bom-import.ts for
 *            per-field semantics (brand upsert, supplier upsert, item dedup,
 *            variant auto-PN, refDes merge).
 *   • sourceLabel — display label for warnings only (e.g. sheet name).
 *
 * Response 201: { data: BomImportResult } — counts + warnings + skipped rows.
 *
 * Rejects 409 when a Draft BOM version already exists on the parent — the
 * user must Activate or delete it first (see importBom docstring for why).
 */
import { z } from "zod";
import { created, handle, parseJson } from "@/lib/server/http";
import { importBom } from "@/lib/server/data/bom-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RowSchema = z.object({
  name: z.string(),
  partNo: z.string().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  supplier: z.string().nullable().optional(),
  designator: z.string().nullable().optional(),
  solderType: z.enum(["SMD", "DIP"]).nullable().optional(),
  footprint: z.string().nullable().optional(),
  qty: z.number(),
  categoryId: z.string().uuid().nullable().optional(),
});

// Row cap keeps a runaway sheet from blowing the tx open. Typical PCB BOMs
// sit around 100–300 rows; 5000 leaves plenty of headroom without inviting
// pathological uploads. Client chunks large sheets into smaller batches with
// mode='append' — the cap here is per-request, not per-sheet.
const Body = z.object({
  rows: z.array(RowSchema).min(1).max(5000),
  sourceLabel: z.string().max(200).optional(),
  mode: z.enum(["create", "append"]).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await parseJson(req, Body);
    return created(await importBom(id, body));
  });
}
