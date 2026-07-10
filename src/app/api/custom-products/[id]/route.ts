/**
 * PATCH  /api/custom-products/[id] — set the active BOM version (`product.edit`).
 * DELETE /api/custom-products/[id] — soft-delete the product + its versions (`product.delete`).
 *
 * [id] is the client id ("cp-<slug>"), a bare slug, or the uuid.
 */
import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/server/http";
import { removeCustomProduct, setActiveCustomVersion } from "@/lib/server/data/custom-products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({ activeVersionId: z.string().min(1) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const { activeVersionId } = await parseJson(req, PatchBody);
    return ok(await setActiveCustomVersion(id, activeVersionId));
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await removeCustomProduct(id));
  });
}
