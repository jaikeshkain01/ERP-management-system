-- ============================================================================
--  StackIOT ERP — PostgreSQL schema
--  Organized by module: Authentication · Masters · Relationships · Inventory ·
--  Production · Purchase. Encodes the decisions in docs/ARCHITECTURE.md:
--    • audit columns + soft delete on every entity table
--    • stock lives ONLY in the inventory ledger (never a catalog column)
--    • inventory_transactions is an append-only, immutable ledger
--    • temporal supplier pricing (valid_from/valid_to)
--    • documents modeled as header + line items
--
--  Conventions
--    • PKs are uuid (gen_random_uuid()). Human codes live in *_code/*_no columns.
--    • Every entity table has: created_by, updated_by -> users(id),
--      created_at, updated_at, deleted_at (soft delete). Reads filter deleted_at IS NULL.
--    • UNIQUE across business keys uses a PARTIAL index WHERE deleted_at IS NULL.
--    • Money: numeric(14,4); qty: numeric(14,3); currency: char(3) default 'INR'.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- exclusion constraints on price validity

-- ---- Enumerated types --------------------------------------------------------
CREATE TYPE product_status       AS ENUM ('Ready','Blocked','Limited');
CREATE TYPE pcb_status           AS ENUM ('Active','Prototype','Deprecated');
CREATE TYPE brand_status         AS ENUM ('Approved','Pending');
CREATE TYPE supplier_status      AS ENUM ('Active','Inactive');
CREATE TYPE solder_type          AS ENUM ('SMD','DIP');
CREATE TYPE prod_order_status    AS ENUM ('Draft','Ready','In Progress','Completed','Cancelled');
CREATE TYPE prod_item_status     AS ENUM ('pending','allocated','consumed','short');
-- Full approval lifecycle (designed ahead of the UI): Draft → Submitted →
-- Manager Approved → Procurement Approved → PO Created; Rejected/Cancelled are terminal branches.
CREATE TYPE pr_status            AS ENUM ('Draft','Submitted','Manager Approved','Procurement Approved','PO Created','Rejected','Cancelled');
CREATE TYPE po_status            AS ENUM ('Draft','Sent','Dispatched','Completed','Cancelled');
CREATE TYPE approval_decision    AS ENUM ('Pending','Approved','Rejected');
CREATE TYPE notification_type    AS ENUM ('shortage','low_stock','approval_request','approval_result','po_created','system');
CREATE TYPE inventory_txn_type   AS ENUM ('IN','OUT','TRANSFER','ADJUSTMENT','RETURN','CONSUMPTION','PRODUCTION');
CREATE TYPE bom_status           AS ENUM ('Draft','Active','Superseded','Obsolete');  -- pcb revisions & product BOM versions

-- ============================================================================
--  AUTHENTICATION
-- ============================================================================
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text NOT NULL,
  password_hash text,
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid, updated_by uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE UNIQUE INDEX uq_users_email ON users (lower(email)) WHERE deleted_at IS NULL;

CREATE TABLE roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX uq_roles_name ON roles (name) WHERE deleted_at IS NULL;

CREATE TABLE permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,          -- e.g. 'components.write', 'purchase.approve'
  description text,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX uq_permissions_code ON permissions (code) WHERE deleted_at IS NULL;

-- Grant link tables (pure M:N; created_* only, revoke = hard delete row)
CREATE TABLE role_permissions (
  role_id       uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);
CREATE TABLE user_roles (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id    uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

-- ============================================================================
--  MASTERS
-- ============================================================================
CREATE TABLE categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,          -- Passive, IC, MCU, Connector, Optoelectronics…
  slug        text NOT NULL,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX uq_categories_slug ON categories (slug) WHERE deleted_at IS NULL;

CREATE TABLE brands (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL,
  name        text NOT NULL,
  description text,
  headquarter text,
  founded     text,
  status      brand_status NOT NULL DEFAULT 'Approved',
  rating      numeric(2,1),
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX uq_brands_slug ON brands (slug) WHERE deleted_at IS NULL;

CREATE TABLE suppliers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL,
  name        text NOT NULL,
  description text,
  contact     text, email text, phone text, address text,
  terms       text,
  rating      numeric(2,1),
  status      supplier_status NOT NULL DEFAULT 'Active',
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX uq_suppliers_slug ON suppliers (slug) WHERE deleted_at IS NULL;

CREATE TABLE warehouses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text NOT NULL,
  name               text NOT NULL,
  location           text,
  is_finished_goods  boolean NOT NULL DEFAULT false,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX uq_warehouses_code ON warehouses (code) WHERE deleted_at IS NULL;

-- NOTE: no stock / bin / last_count here — quantity is owned by the inventory ledger.
CREATE TABLE components (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generic_pn         text NOT NULL,          -- internal part number, e.g. RES-10K
  name               text NOT NULL,
  category_id        uuid REFERENCES categories(id),
  description        text,
  unit               text NOT NULL DEFAULT 'PCS',
  solder_type        solder_type,
  footprint          text,
  spq                integer,                -- internal standard pack qty
  min_stock          numeric(14,3) NOT NULL DEFAULT 0,   -- policy threshold
  reorder_qty        numeric(14,3) NOT NULL DEFAULT 0,
  annual_consumption numeric(14,3) NOT NULL DEFAULT 0,   -- for coverage analytics
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX uq_components_generic_pn ON components (generic_pn) WHERE deleted_at IS NULL;

CREATE TABLE pcbs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             text NOT NULL,
  name             text NOT NULL,
  description      text,
  layers           integer,
  status           pcb_status NOT NULL DEFAULT 'Active',
  -- stock_count is DERIVED from the finished-goods ledger, not stored here.
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX uq_pcbs_slug ON pcbs (slug) WHERE deleted_at IS NULL;

-- PCB revisions (Rev A, Rev B). The BOM lines (pcb_lines) belong to a REVISION,
-- so a board can evolve while staying one reusable master.
CREATE TABLE pcb_revisions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pcb_id         uuid NOT NULL REFERENCES pcbs(id),
  rev            text NOT NULL,          -- 'Rev A', 'Rev B'
  status         bom_status NOT NULL DEFAULT 'Draft',
  effective_from date,
  effective_to   date,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE UNIQUE INDEX uq_pcb_rev ON pcb_revisions (pcb_id, rev) WHERE deleted_at IS NULL;
-- at most one Active revision per PCB
CREATE UNIQUE INDEX uq_pcb_rev_active ON pcb_revisions (pcb_id) WHERE status = 'Active' AND deleted_at IS NULL;

CREATE TABLE products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL,
  code            text NOT NULL,          -- ROIP400
  name            text NOT NULL,
  version         text,
  description     text,
  status          product_status NOT NULL DEFAULT 'Ready',
  estimated_cost  numeric(14,2),          -- may also be derived from BOM
  -- buildable_qty is DERIVED (min over BOM of available ÷ qty-per-unit).
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX uq_products_code ON products (code) WHERE deleted_at IS NULL;

-- Product BOM versions (v1.0, v1.1). A version selects which PCB REVISIONS the
-- product is built from (via product_pcbs below).
CREATE TABLE bom_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid NOT NULL REFERENCES products(id),
  version        text NOT NULL,          -- '1.0', '1.1'
  status         bom_status NOT NULL DEFAULT 'Draft',
  effective_from date,
  effective_to   date,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE UNIQUE INDEX uq_bom_version ON bom_versions (product_id, version) WHERE deleted_at IS NULL;
-- at most one Active BOM version per product
CREATE UNIQUE INDEX uq_bom_active ON bom_versions (product_id) WHERE status = 'Active' AND deleted_at IS NULL;

-- ============================================================================
--  RELATIONSHIPS  (join/child tables with attributes)
-- ============================================================================

-- Product BOM version → PCB revision : boards per finished unit, assembly order.
-- Scoped to a bom_version and pinned to a specific pcb_revision.
CREATE TABLE product_pcbs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_version_id  uuid NOT NULL REFERENCES bom_versions(id),
  pcb_revision_id uuid NOT NULL REFERENCES pcb_revisions(id),
  qty             integer NOT NULL DEFAULT 1 CHECK (qty > 0),
  sequence        integer,
  remarks         text,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX uq_product_pcbs ON product_pcbs (bom_version_id, pcb_revision_id) WHERE deleted_at IS NULL;

-- PCB BOM line : parts per board, reference designators, preferred brand.
-- Belongs to a PCB REVISION (Rev A/B), not the PCB directly.
CREATE TABLE pcb_lines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pcb_revision_id    uuid NOT NULL REFERENCES pcb_revisions(id),
  component_id       uuid NOT NULL REFERENCES components(id),
  qty                integer NOT NULL CHECK (qty > 0),
  ref_des            text,               -- 'R1-R20', 'C1-C10', 'U1'
  preferred_brand_id uuid REFERENCES brands(id),
  remarks            text,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX uq_pcb_lines ON pcb_lines (pcb_revision_id, component_id) WHERE deleted_at IS NULL;

CREATE TABLE component_specs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id  uuid NOT NULL REFERENCES components(id),
  key           text NOT NULL,
  value         text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,   -- ORDER BY for stable UI
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

-- Component ↔ Brand : manufacturer variant (part number). NO stock column.
CREATE TABLE component_brand_variants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id uuid NOT NULL REFERENCES components(id),
  brand_id     uuid NOT NULL REFERENCES brands(id),
  part_no      text NOT NULL,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX uq_cbv ON component_brand_variants (component_id, brand_id) WHERE deleted_at IS NULL;

-- Supplier price book : temporal, per (component, supplier, brand)
CREATE TABLE supplier_component_prices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id   uuid NOT NULL REFERENCES components(id),
  supplier_id    uuid NOT NULL REFERENCES suppliers(id),
  brand_id       uuid NOT NULL REFERENCES brands(id),
  price          numeric(14,4) NOT NULL,
  currency       char(3) NOT NULL DEFAULT 'INR',
  moq            numeric(14,3),
  spq            numeric(14,3),
  lead_time_days integer,
  valid_from     date NOT NULL DEFAULT CURRENT_DATE,
  valid_to       date,                 -- NULL = open/current
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CHECK (valid_to IS NULL OR valid_to >= valid_from),
  -- no two overlapping validity windows for the same triple (active rows only)
  EXCLUDE USING gist (
    component_id WITH =, supplier_id WITH =, brand_id WITH =,
    daterange(valid_from, valid_to) WITH &&
  ) WHERE (deleted_at IS NULL)
);

-- ============================================================================
--  INVENTORY  (append-only ledger + projected balances)
-- ============================================================================

-- Balances = read-model. Maintained ONLY by triggers/app from the ledger.
CREATE TABLE inventory (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_brand_variant_id uuid NOT NULL REFERENCES component_brand_variants(id),
  warehouse_id               uuid NOT NULL REFERENCES warehouses(id),
  on_hand    numeric(14,3) NOT NULL DEFAULT 0,   -- Σ ledger qty_delta
  reserved   numeric(14,3) NOT NULL DEFAULT 0,   -- Σ open allocations
  available  numeric(14,3) GENERATED ALWAYS AS (on_hand - reserved) STORED,
  damaged    numeric(14,3) NOT NULL DEFAULT 0,
  bin        text,
  last_counted_at timestamptz,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (component_brand_variant_id, warehouse_id)
);

-- THE LEDGER — immutable, append-only. No updated_*/deleted_at.
-- A TRANSFER is recorded as TWO rows (source −qty, dest +qty) sharing transfer_group_id.
CREATE TABLE inventory_transactions (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type                       inventory_txn_type NOT NULL,
  component_brand_variant_id uuid NOT NULL REFERENCES component_brand_variants(id),
  warehouse_id               uuid NOT NULL REFERENCES warehouses(id),
  qty_delta                  numeric(14,3) NOT NULL CHECK (qty_delta <> 0),  -- signed
  transfer_group_id          uuid,        -- pairs the two legs of a TRANSFER
  ref_type                   text,        -- 'purchase_order' | 'production_order' | 'goods_receipt' | 'adjustment' | …
  ref_id                     uuid,
  reason                     text,
  note                       text,
  created_by                 uuid REFERENCES users(id),
  created_at                 timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_inv_txn_variant_wh ON inventory_transactions (component_brand_variant_id, warehouse_id);
CREATE INDEX ix_inv_txn_ref        ON inventory_transactions (ref_type, ref_id);
CREATE INDEX ix_inv_txn_created    ON inventory_transactions (created_at);

-- ============================================================================
--  PRODUCTION  (order header → items → allocations → consumptions)
-- ============================================================================
CREATE TABLE production_orders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no     text NOT NULL,            -- PO-001 (production)
  product_id   uuid NOT NULL REFERENCES products(id),
  bom_version_id uuid REFERENCES bom_versions(id),  -- snapshot: which BOM version this batch was built against
  qty          integer NOT NULL CHECK (qty > 0),
  status       prod_order_status NOT NULL DEFAULT 'Draft',
  target_date  date,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX uq_prod_orders_no ON production_orders (order_no) WHERE deleted_at IS NULL;

-- STAGE 1 PLAN: exploded BOM demand. required_qty = pcb_lines.qty × product_pcbs.qty × order.qty
CREATE TABLE production_order_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id uuid NOT NULL REFERENCES production_orders(id),
  component_id        uuid NOT NULL REFERENCES components(id),
  required_qty        numeric(14,3) NOT NULL,
  status              prod_item_status NOT NULL DEFAULT 'pending',
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX ix_prod_items_order ON production_order_items (production_order_id);

-- STAGE 2 ALLOCATE: reserve specific inventory (adjusts inventory.reserved; not a ledger txn)
CREATE TABLE production_allocations (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_item_id   uuid NOT NULL REFERENCES production_order_items(id),
  component_brand_variant_id uuid NOT NULL REFERENCES component_brand_variants(id),
  warehouse_id               uuid NOT NULL REFERENCES warehouses(id),
  allocated_qty              numeric(14,3) NOT NULL CHECK (allocated_qty > 0),
  allocated_at               timestamptz NOT NULL DEFAULT now(),
  released_at                timestamptz,          -- set when released without consuming
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

-- STAGE 3 CONSUME: issue to the build → appends inventory_transactions(type='CONSUMPTION')
CREATE TABLE production_consumptions (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_item_id   uuid NOT NULL REFERENCES production_order_items(id),
  allocation_id              uuid REFERENCES production_allocations(id),
  component_brand_variant_id uuid NOT NULL REFERENCES component_brand_variants(id),
  warehouse_id               uuid NOT NULL REFERENCES warehouses(id),
  consumed_qty               numeric(14,3) NOT NULL CHECK (consumed_qty > 0),
  consumed_at                timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
-- STAGE 4 COMPLETE: production_orders.status → 'Completed' + inventory_transactions(type='PRODUCTION').

-- ============================================================================
--  PURCHASE  (PR header/items → PO header/items → goods_receipts)
-- ============================================================================
CREATE TABLE purchase_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_no        text NOT NULL,            -- PR-0001
  status       pr_status NOT NULL DEFAULT 'Draft',
  requested_by uuid REFERENCES users(id),
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  remarks      text,
  total_cost   numeric(14,2),            -- = Σ line totals (derived)
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX uq_pr_no ON purchase_requests (pr_no) WHERE deleted_at IS NULL;

CREATE TABLE purchase_request_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id uuid NOT NULL REFERENCES purchase_requests(id),
  component_id        uuid NOT NULL REFERENCES components(id),
  brand_id            uuid REFERENCES brands(id),       -- desired brand (optional)
  supplier_id         uuid REFERENCES suppliers(id),    -- recommended (finalized at PO)
  qty                 numeric(14,3) NOT NULL CHECK (qty > 0),
  unit_price          numeric(14,4),
  line_total          numeric(14,2),
  required_by         date,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX ix_pr_items_pr ON purchase_request_items (purchase_request_id);

CREATE TABLE purchase_orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_no       text NOT NULL,            -- PO-984302 (purchase)
  pr_id       uuid REFERENCES purchase_requests(id),   -- sourced from
  supplier_id uuid NOT NULL REFERENCES suppliers(id),  -- ONE supplier per PO
  status      po_status NOT NULL DEFAULT 'Draft',
  order_date  date NOT NULL DEFAULT CURRENT_DATE,
  total_cost  numeric(14,2),
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX uq_po_no ON purchase_orders (po_no) WHERE deleted_at IS NULL;

CREATE TABLE purchase_order_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id),
  pr_item_id        uuid REFERENCES purchase_request_items(id),  -- traceability PR line → PO line
  component_id      uuid NOT NULL REFERENCES components(id),
  brand_id          uuid REFERENCES brands(id),
  qty               numeric(14,3) NOT NULL CHECK (qty > 0),
  unit_price        numeric(14,4),
  line_total        numeric(14,2),
  received_qty      numeric(14,3) NOT NULL DEFAULT 0,   -- running total from goods_receipts
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX ix_po_items_po ON purchase_order_items (purchase_order_id);

-- Goods-in: each receipt line records what physically arrived against a PO line,
-- into a specific brand variant + warehouse. Should append inventory_transactions(type='IN').
CREATE TABLE goods_receipts (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_no                     text NOT NULL,          -- GRN-0001
  purchase_order_id          uuid NOT NULL REFERENCES purchase_orders(id),
  purchase_order_item_id     uuid NOT NULL REFERENCES purchase_order_items(id),
  component_brand_variant_id uuid NOT NULL REFERENCES component_brand_variants(id),
  warehouse_id               uuid NOT NULL REFERENCES warehouses(id),
  received_qty               numeric(14,3) NOT NULL CHECK (received_qty > 0),
  received_at                timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX ix_grn_po ON goods_receipts (purchase_order_id);

-- ============================================================================
--  WORKFLOW / APPROVALS
-- ============================================================================
-- Generic approval audit trail — one row per approval STEP on any document.
-- Today: purchase_requests (manager, procurement). Reusable for future flows
-- (production orders, BOM releases, …) via the polymorphic entity_type/entity_id.
CREATE TABLE approvals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,               -- 'purchase_request' | 'production_order' | 'bom_version' | …
  entity_id   uuid NOT NULL,
  step        text NOT NULL,               -- 'manager' | 'procurement' | …
  seq         integer NOT NULL DEFAULT 1,  -- step order in the chain
  decision    approval_decision NOT NULL DEFAULT 'Pending',
  decided_by  uuid REFERENCES users(id),
  decided_at  timestamptz,
  comment     text,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX ix_approvals_entity ON approvals (entity_type, entity_id);

-- ============================================================================
--  NOTIFICATIONS
-- ============================================================================
-- Lightweight per-user feed (shortages, low stock, approval requests, …).
-- Append + mark-read; exempt from the full audit convention like other logs.
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id),
  type       notification_type NOT NULL,
  title      text NOT NULL,
  body       text,
  ref_type   text,                 -- optional deep link, e.g. 'purchase_request'
  ref_id     uuid,
  is_read    boolean NOT NULL DEFAULT false,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_notifications_user_unread ON notifications (user_id) WHERE is_read = false;

-- ============================================================================
--  TRIGGERS
-- ============================================================================

-- 1) Auto-bump updated_at on every table that has the column (skips the ledger).
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON %1$I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;

-- 2) Project the ledger into inventory.on_hand. The ONLY writer of on_hand.
CREATE OR REPLACE FUNCTION apply_inventory_txn() RETURNS trigger AS $$
BEGIN
  INSERT INTO inventory (component_brand_variant_id, warehouse_id, on_hand)
  VALUES (NEW.component_brand_variant_id, NEW.warehouse_id, NEW.qty_delta)
  ON CONFLICT (component_brand_variant_id, warehouse_id)
  DO UPDATE SET on_hand = inventory.on_hand + EXCLUDED.on_hand, updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_apply_inventory_txn
  AFTER INSERT ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION apply_inventory_txn();

-- 3) Maintain inventory.reserved from allocations (available is generated).
CREATE OR REPLACE FUNCTION apply_allocation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE inventory SET reserved = reserved + NEW.allocated_qty, updated_at = now()
     WHERE component_brand_variant_id = NEW.component_brand_variant_id
       AND warehouse_id = NEW.warehouse_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.released_at IS NOT NULL AND OLD.released_at IS NULL THEN
    UPDATE inventory SET reserved = reserved - NEW.allocated_qty, updated_at = now()
     WHERE component_brand_variant_id = NEW.component_brand_variant_id
       AND warehouse_id = NEW.warehouse_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_apply_allocation
  AFTER INSERT OR UPDATE ON production_allocations
  FOR EACH ROW EXECUTE FUNCTION apply_allocation();

-- NOTE (application/service layer, not shown as triggers to keep effects explicit):
--   • goods_receipts insert  → inventory_transactions(type='IN')  + bump po_item.received_qty
--   • production_consumptions → inventory_transactions(type='CONSUMPTION') + release reservation
--   • production complete     → inventory_transactions(type='PRODUCTION') into finished-goods wh
--   • TRANSFER                → two ledger rows sharing transfer_group_id (−source, +dest)
