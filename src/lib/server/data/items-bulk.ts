/**
 * Bulk operations across a selection of items.
 *
 * Universal — the products and semi-assembled modules both consume the
 * same endpoint. Each module owns its own selection UI and toolbar, but
 * the actual DB work (status transitions, finished-good toggle, soft
 * delete) is one write path shared here.
 *
 * The endpoint is NOT transactional across items: a single row failing
 * (e.g. delete blocked by on-hand stock) shouldn't roll back every other
 * row's success. Instead we iterate, catch, and return per-item results
 * so the client can surface exactly which rows failed and why.
 */

import { z } from "zod";
import { withTenant, type TxClient, type TenantContext } from "@/lib/prisma";
import { requireSession } from "@/lib/server/session";
import { assertPermission } from "@/lib/server/rbac";
import { ApiError, Errors } from "@/lib/server/http";
import { isUuid } from "@/lib/server/data/util";
import { updateItem, deleteItem } from "@/lib/server/data/items";

async function guarded<T>(perm: string, fn: (tx: TxClient, ctx: TenantContext) => Promise<T>): Promise<T> {
  const ctx = await requireSession();
  return withTenant(ctx, async (tx) => {
    await assertPermission(tx, ctx, perm);
    return fn(tx, ctx);
  });
}

export const BULK_ACTIONS = [
  "activate", "deactivate", "discontinue",
  "mark_finished", "unmark_finished",
  "delete",
] as const;
export type BulkAction = typeof BULK_ACTIONS[number];

export const BulkInputSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(BULK_ACTIONS),
});
export type BulkInput = z.infer<typeof BulkInputSchema>;

export interface BulkResult {
  action: BulkAction;
  succeeded: string[];
  failed: Array<{ id: string; reason: string }>;
}

/** Per-action requirement so we validate up front — activate needs
 *  `item.edit`, delete needs `item.delete`. */
function permForAction(action: BulkAction): string {
  return action === "delete" ? "item.delete" : "item.edit";
}

export async function bulkUpdateItems(input: BulkInput): Promise<BulkResult> {
  // Validate every id looks like a uuid (schema already checked, but double
  // guard because the shape flows straight into raw SQL further down).
  for (const id of input.ids) {
    if (!isUuid(id)) throw Errors.badRequest("Invalid item id", { id });
  }
  // Auth check once. The per-item `updateItem` / `deleteItem` each run
  // their own guarded() with the same perm, which is fine — RBAC will
  // short-circuit fast if the caller lacks it.
  return guarded(permForAction(input.action), async () => {
    const succeeded: string[] = [];
    const failed: Array<{ id: string; reason: string }> = [];

    for (const id of input.ids) {
      try {
        switch (input.action) {
          case "activate":
            await updateItem(id, { status: "active" });
            break;
          case "deactivate":
            await updateItem(id, { status: "inactive" });
            break;
          case "discontinue":
            await updateItem(id, { status: "discontinued" });
            break;
          case "mark_finished":
            await updateItem(id, { isFinishedGood: true });
            break;
          case "unmark_finished":
            await updateItem(id, { isFinishedGood: false });
            break;
          case "delete":
            await deleteItem(id);
            break;
        }
        succeeded.push(id);
      } catch (e) {
        // ApiError carries a user-friendly message (Errors.conflict /
        // Errors.notFound produce these); anything else is coerced to a
        // string so the client always has SOMETHING to display.
        const reason =
          e instanceof ApiError ? e.message
          : e instanceof Error ? e.message
          : "operation failed";
        failed.push({ id, reason });
      }
    }

    return { action: input.action, succeeded, failed };
  });
}
