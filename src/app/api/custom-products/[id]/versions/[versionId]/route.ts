/**
 * DELETE /api/custom-products/[id]/versions/[versionId] — soft-delete one BOM
 * version (`product.edit`). Refuses to remove the last remaining version.
 */
import { handle, ok } from "@/lib/server/http";
import { removeCustomVersion } from "@/lib/server/data/custom-products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  return handle(async () => {
    const { id, versionId } = await params;
    return ok(await removeCustomVersion(id, versionId));
  });
}
