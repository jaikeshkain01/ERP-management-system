/** GET /api/products — list products with counts (real mode: `product.view`). */
import { handle, ok } from "@/lib/server/http";
import { listProducts } from "@/lib/server/data/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(await listProducts()));
}
