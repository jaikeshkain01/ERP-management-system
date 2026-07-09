/**
 * In-memory stubs used in FULL MOCK MODE (isTesting=true) — no database.
 * A fixed admin identity + company stand in for the real session/tenant.
 */
import type { TenantContext } from "@/lib/prisma";

export const MOCK_USER = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Test Admin",
  email: "admin@stackiot.local",
};

export const MOCK_COMPANY = {
  id: "00000000-0000-0000-0000-000000000002",
  code: "STACKIOT",
  name: "StackIOT (mock)",
};

/** The tenant context assumed for every request in mock mode. */
export const MOCK_CONTEXT: TenantContext = {
  userId: MOCK_USER.id,
  companyId: MOCK_COMPANY.id,
};

/** Synthetic single warehouse + default bin (mockdata has no warehouse dimension). */
export const MOCK_WAREHOUSE = {
  id: "00000000-0000-0000-0000-000000000003",
  code: "MAIN",
  name: "Main Warehouse (mock)",
  location: "HQ",
  isFinishedGoods: false,
};

export const MOCK_BIN = {
  id: "00000000-0000-0000-0000-000000000004",
  warehouseId: MOCK_WAREHOUSE.id,
  parentId: null as string | null,
  kind: "bin",
  code: "MAIN-BIN",
  name: "Default Bin",
  isDefault: true,
};
