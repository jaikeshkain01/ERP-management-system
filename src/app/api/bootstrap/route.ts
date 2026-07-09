/** GET /api/bootstrap — the whole catalog (DataSet) for the client data provider. */
import { handle, ok } from "@/lib/server/http";
import { getBootstrap } from "@/lib/server/data/bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(await getBootstrap()));
}
