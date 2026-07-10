/**
 * DELETE /api/brands/[id]/suppliers/[supplierId] — unmap a supplier from a brand
 * (`brand.edit`). Both ids accept uuid or slug.
 */
import { handle, ok } from "@/lib/server/http";
import { removeBrandSupplier } from "@/lib/server/data/brands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; supplierId: string }> },
) {
  return handle(async () => {
    const { id, supplierId } = await params;
    return ok(await removeBrandSupplier(id, supplierId));
  });
}
