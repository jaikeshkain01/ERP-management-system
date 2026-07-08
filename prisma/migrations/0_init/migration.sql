-- ============================================================================
--  StackIOT ERP — PostgreSQL schema
--  Organized by module: Authentication · Masters · Relationships · Inventory ·
--  Production · Purchase. Encodes the decisions in docs/ARCHITECTURE.md:
--    • MULTI-TENANT: one installation serves many companies (see below + §0)
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
--
--  Multi-tenancy (highest-priority design axis)
--    • companies is the TENANT ROOT. Every tenant-owned table carries
--      company_id uuid NOT NULL REFERENCES companies(id).
--    • GLOBAL tables (no company_id): companies, users.
--        - users are a shared identity pool; a user reaches one or more companies
--          through company_memberships (users span companies), which also pins the
--          user's role in that company.
--        - roles are per-company; each role grants (resource, action) permissions
--          directly on role_permissions. The permission catalog is an app constant.
--    • Business-key uniqueness is scoped PER COMPANY: every *_code/slug/*_no unique
--      index is prefixed with company_id, so 'RES-10K' can exist once per company.
--    • Cross-tenant edges are impossible: FKs between two tenant tables are
--      COMPOSITE — (company_id, x_id) REFERENCES parent (company_id, id). This
--      needs a UNIQUE (company_id, id) on every tenant table (declared inline).
--      FKs to the GLOBAL users table stay single-column.
--    • Runtime isolation is enforced by ROW LEVEL SECURITY keyed on the
--      app.current_company_id session GUC — see the RLS section at the end.
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
CREATE TYPE membership_status    AS ENUM ('active','invited','suspended');
-- Permission scope = a fixed VERB applied to a RESOURCE (role_permissions.resource).
-- e.g. product.view / product.create / product.edit / product.delete / product.approve
CREATE TYPE permission_action    AS ENUM ('view','create','edit','delete','approve','export');
CREATE TYPE audit_action         AS ENUM ('INSERT','UPDATE','DELETE');
CREATE TYPE location_kind        AS ENUM ('zone','rack','bin');        -- storage_locations tree (extensible)
CREATE TYPE material_move_kind   AS ENUM ('allocation','consumption'); -- production_material_moves

-- ============================================================================
--  §0  TENANCY ROOT
-- ============================================================================
-- The tenant. GLOBAL (no company_id). Everything tenant-owned FKs back to this.
CREATE TABLE companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,            -- short tenant handle, e.g. 'STACKIOT'
  name        text NOT NULL,
  created_by  uuid, updated_by uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX uq_companies_code ON companies (lower(code)) WHERE deleted_at IS NULL;

-- ============================================================================
--  AUTHENTICATION
--  users are GLOBAL. roles + role_permissions are per-company; role_permissions grants
--  (resource, action) directly (no permissions catalog table — it's an app constant).
--  company_memberships bridges users → companies AND pins the user's role per company.
-- ============================================================================
CREATE TABLE users (                       -- GLOBAL identity (no company_id)
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

-- Which companies a user can access, and their default (login) company.
CREATE TABLE company_memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     uuid,                             -- the user's role IN this company (one role;
                                                -- multi-role = future join table). FK added
                                                -- after roles (below). NULL = no role yet.
  is_default  boolean NOT NULL DEFAULT false,   -- the company auto-selected at login
  status      membership_status NOT NULL DEFAULT 'active',
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE UNIQUE INDEX uq_membership ON company_memberships (company_id, user_id) WHERE deleted_at IS NULL;
-- at most one default company per user
CREATE UNIQUE INDEX uq_membership_default ON company_memberships (user_id) WHERE is_default AND deleted_at IS NULL;

-- NO permissions CATALOG TABLE. The permission set is a fixed (resource, action)
-- matrix defined in application code (docs/ARCHITECTURE.md §7h) — the verbs are an
-- enum and the resources are known at build time, so a DB catalog added little. A
-- role's grants live directly on role_permissions as (resource, action) pairs.

-- Roles are PER-COMPANY: each tenant defines its own roles.
CREATE TABLE roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id),
  name        text NOT NULL,
  description text,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, id)                  -- composite-FK target
);
CREATE UNIQUE INDEX uq_roles_name ON roles (company_id, name) WHERE deleted_at IS NULL;

-- A role's granted permissions, stored directly as (resource, action) — the matrix
-- that used to be a catalog table. company_id carried for RLS; role_id composite-FK'd.
CREATE TABLE role_permissions (
  company_id uuid NOT NULL REFERENCES companies(id),
  role_id    uuid NOT NULL,
  resource   text NOT NULL,                 -- 'product','inventory','purchase_request', …
  action     permission_action NOT NULL,    -- view|create|edit|delete|approve|export
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, resource, action),
  FOREIGN KEY (company_id, role_id) REFERENCES roles (company_id, id) ON DELETE CASCADE
);

-- (No user_roles table — a user's role per company lives on company_memberships.role_id;
--  multi-role-per-user is a deferred future join table.) Wire membership → role now
--  that roles exists:
ALTER TABLE company_memberships
  ADD CONSTRAINT fk_membership_role
  FOREIGN KEY (company_id, role_id) REFERENCES roles (company_id, id);

-- ============================================================================
--  MASTERS
-- ============================================================================
-- (No categories table — component.category is a plain label column; the mock treats
--  category as a string. Promote to a table later only if categories need own metadata.)
CREATE TABLE brands (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id),
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
  deleted_at  timestamptz,
  UNIQUE (company_id, id)
);
CREATE UNIQUE INDEX uq_brands_slug ON brands (company_id, slug) WHERE deleted_at IS NULL;

CREATE TABLE suppliers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id),
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
  deleted_at  timestamptz,
  UNIQUE (company_id, id)
);
CREATE UNIQUE INDEX uq_suppliers_slug ON suppliers (company_id, slug) WHERE deleted_at IS NULL;

CREATE TABLE warehouses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES companies(id),
  code               text NOT NULL,
  name               text NOT NULL,
  location           text,
  is_finished_goods  boolean NOT NULL DEFAULT false,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, id)
);
CREATE UNIQUE INDEX uq_warehouses_code ON warehouses (company_id, code) WHERE deleted_at IS NULL;

-- Location hierarchy: Warehouse → Zone → Rack → Bin, modeled as ONE self-referencing
-- tree (parent_id) instead of a table per level — so depth is flexible (add 'aisle',
-- 'shelf', … via the location_kind enum, no new tables). Stock lives at the leaf
-- (kind='bin'). warehouse_id is denormalized on every node and threaded through the
-- self-FK, so a node can never drift into another warehouse (or tenant).
CREATE TABLE storage_locations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id),
  warehouse_id uuid NOT NULL,
  parent_id    uuid,                 -- up the tree; NULL at the top level (e.g. a zone)
  kind         location_kind NOT NULL,   -- 'zone' | 'rack' | 'bin' (extensible)
  code         text NOT NULL,        -- 'Z1' / 'R12' / 'A12'
  name         text,
  is_default   boolean NOT NULL DEFAULT false,   -- the bulk bin for un-slotted stock
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, id),
  UNIQUE (company_id, warehouse_id, id),   -- composite-FK target (self-ref + inventory/moves)
  FOREIGN KEY (company_id, warehouse_id) REFERENCES warehouses (company_id, id),
  FOREIGN KEY (company_id, warehouse_id, parent_id) REFERENCES storage_locations (company_id, warehouse_id, id)
);
-- code unique within a warehouse ('A12' reads as one warehouse address)
CREATE UNIQUE INDEX uq_location_code ON storage_locations (company_id, warehouse_id, code) WHERE deleted_at IS NULL;
-- one default/bulk bin per warehouse (holds stock that isn't slotted yet)
CREATE UNIQUE INDEX uq_location_default_bin ON storage_locations (company_id, warehouse_id)
  WHERE is_default AND kind = 'bin' AND deleted_at IS NULL;

-- NOTE: no stock / bin / last_count here — quantity is owned by the inventory ledger.
CREATE TABLE components (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES companies(id),
  generic_pn         text NOT NULL,          -- internal part number, e.g. RES-10K
  name               text NOT NULL,
  category           text,                   -- label: Passive, IC, MCU, Connector, … (was categories table)
  description        text,
  unit               text NOT NULL DEFAULT 'PCS',
  solder_type        solder_type,
  footprint          text,
  spq                integer,                -- internal standard pack qty
  min_stock          numeric(14,3) NOT NULL DEFAULT 0,   -- policy threshold
  reorder_qty        numeric(14,3) NOT NULL DEFAULT 0,
  annual_consumption numeric(14,3) NOT NULL DEFAULT 0,   -- for coverage analytics
  specs              jsonb NOT NULL DEFAULT '[]'::jsonb, -- ordered [{key,value}] spec sheet (was component_specs)
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, id)
);
CREATE UNIQUE INDEX uq_components_generic_pn ON components (company_id, generic_pn) WHERE deleted_at IS NULL;

CREATE TABLE pcbs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id),
  slug             text NOT NULL,
  name             text NOT NULL,
  description      text,
  layers           integer,
  status           pcb_status NOT NULL DEFAULT 'Active',
  -- stock_count is DERIVED from the finished-goods ledger, not stored here.
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, id)
);
CREATE UNIQUE INDEX uq_pcbs_slug ON pcbs (company_id, slug) WHERE deleted_at IS NULL;

-- PCB revisions (Rev A, Rev B). The BOM lines (pcb_lines) belong to a REVISION,
-- so a board can evolve while staying one reusable master.
CREATE TABLE pcb_revisions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id),
  pcb_id         uuid NOT NULL,
  rev            text NOT NULL,          -- 'Rev A', 'Rev B'
  status         bom_status NOT NULL DEFAULT 'Draft',
  effective_from date,
  effective_to   date,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, pcb_id) REFERENCES pcbs (company_id, id)
);
CREATE UNIQUE INDEX uq_pcb_rev ON pcb_revisions (pcb_id, rev) WHERE deleted_at IS NULL;
-- at most one Active revision per PCB
CREATE UNIQUE INDEX uq_pcb_rev_active ON pcb_revisions (pcb_id) WHERE status = 'Active' AND deleted_at IS NULL;

CREATE TABLE products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id),
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
  deleted_at  timestamptz,
  UNIQUE (company_id, id)
);
CREATE UNIQUE INDEX uq_products_code ON products (company_id, code) WHERE deleted_at IS NULL;

-- Product BOM versions (v1.0, v1.1). A version selects which PCB REVISIONS the
-- product is built from (via product_pcbs below).
CREATE TABLE bom_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id),
  product_id     uuid NOT NULL,
  version        text NOT NULL,          -- '1.0', '1.1'
  status         bom_status NOT NULL DEFAULT 'Draft',
  effective_from date,
  effective_to   date,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, product_id) REFERENCES products (company_id, id)
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
  company_id      uuid NOT NULL REFERENCES companies(id),
  bom_version_id  uuid NOT NULL,
  pcb_revision_id uuid NOT NULL,
  qty             integer NOT NULL DEFAULT 1 CHECK (qty > 0),
  sequence        integer,
  remarks         text,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, bom_version_id)  REFERENCES bom_versions (company_id, id),
  FOREIGN KEY (company_id, pcb_revision_id) REFERENCES pcb_revisions (company_id, id)
);
CREATE UNIQUE INDEX uq_product_pcbs ON product_pcbs (bom_version_id, pcb_revision_id) WHERE deleted_at IS NULL;

-- PCB BOM line : parts per board, reference designators, preferred brand.
-- Belongs to a PCB REVISION (Rev A/B), not the PCB directly.
CREATE TABLE pcb_lines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES companies(id),
  pcb_revision_id    uuid NOT NULL,
  component_id       uuid NOT NULL,
  qty                integer NOT NULL CHECK (qty > 0),
  ref_des            text,               -- 'R1-R20', 'C1-C10', 'U1'
  preferred_brand_id uuid,
  remarks            text,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, pcb_revision_id)    REFERENCES pcb_revisions (company_id, id),
  FOREIGN KEY (company_id, component_id)       REFERENCES components (company_id, id),
  FOREIGN KEY (company_id, preferred_brand_id) REFERENCES brands (company_id, id)
);
CREATE UNIQUE INDEX uq_pcb_lines ON pcb_lines (pcb_revision_id, component_id) WHERE deleted_at IS NULL;

-- (No component_specs table — specs live as an ordered jsonb array on components.specs.)

-- Component ↔ Brand : manufacturer variant (part number). NO stock column.
CREATE TABLE component_brand_variants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id),
  component_id uuid NOT NULL,
  brand_id     uuid NOT NULL,
  part_no      text NOT NULL,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, component_id) REFERENCES components (company_id, id),
  FOREIGN KEY (company_id, brand_id)     REFERENCES brands (company_id, id)
);
CREATE UNIQUE INDEX uq_cbv ON component_brand_variants (component_id, brand_id) WHERE deleted_at IS NULL;

-- Supplier price book : temporal, per (component, supplier, brand)
CREATE TABLE supplier_component_prices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id),
  component_id   uuid NOT NULL,
  supplier_id    uuid NOT NULL,
  brand_id       uuid NOT NULL,
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
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, component_id) REFERENCES components (company_id, id),
  FOREIGN KEY (company_id, supplier_id)  REFERENCES suppliers (company_id, id),
  FOREIGN KEY (company_id, brand_id)     REFERENCES brands (company_id, id),
  -- no two overlapping validity windows for the same triple within a company (active rows only)
  EXCLUDE USING gist (
    company_id WITH =, component_id WITH =, supplier_id WITH =, brand_id WITH =,
    daterange(valid_from, valid_to) WITH &&
  ) WHERE (deleted_at IS NULL)
);

-- ============================================================================
--  INVENTORY  (append-only ledger + projected balances)
-- ============================================================================

-- The read-model: a projection of the ledger (hence the name — it holds balances,
-- not "the inventory", which is the whole module). Maintained ONLY by triggers/app.
CREATE TABLE inventory_balances (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                 uuid NOT NULL REFERENCES companies(id),
  component_brand_variant_id uuid NOT NULL,
  warehouse_id               uuid NOT NULL,      -- denormalized from the location (fast warehouse roll-ups)
  location_id                uuid NOT NULL,      -- the bin (leaf storage_locations node)
  on_hand    numeric(14,3) NOT NULL DEFAULT 0,   -- Σ ledger qty_delta
  reserved   numeric(14,3) NOT NULL DEFAULT 0,   -- Σ open allocations
  available  numeric(14,3) GENERATED ALWAYS AS (on_hand - reserved) STORED,
  damaged    numeric(14,3) NOT NULL DEFAULT 0,
  last_counted_at timestamptz,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (component_brand_variant_id, location_id),   -- one balance row per variant per bin
  FOREIGN KEY (company_id, component_brand_variant_id) REFERENCES component_brand_variants (company_id, id),
  FOREIGN KEY (company_id, warehouse_id)               REFERENCES warehouses (company_id, id),
  FOREIGN KEY (company_id, warehouse_id, location_id)  REFERENCES storage_locations (company_id, warehouse_id, id)
);

-- THE LEDGER — immutable, append-only. No updated_*/deleted_at.
-- A TRANSFER is recorded as TWO rows (source −qty, dest +qty) sharing transfer_group_id.
CREATE TABLE inventory_transactions (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                 uuid NOT NULL REFERENCES companies(id),
  type                       inventory_txn_type NOT NULL,
  component_brand_variant_id uuid NOT NULL,
  warehouse_id               uuid NOT NULL,      -- denormalized from location_id (roll-up + FK guard)
  location_id                uuid NOT NULL,      -- bin leaf; a TRANSFER's two legs carry different locations
  qty_delta                  numeric(14,3) NOT NULL CHECK (qty_delta <> 0),  -- signed
  transfer_group_id          uuid,        -- pairs the two legs of a TRANSFER
  ref_type                   text,        -- source doc: 'purchase_order_item' (goods-in), 'production_order',
  ref_id                     uuid,        --   'adjustment', … — goods receipts are just type='IN' rows here
  grn_no                     text,        -- optional goods-receipt note number (no separate GRN table)
  reason                     text,
  note                       text,
  created_by                 uuid REFERENCES users(id),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (company_id, component_brand_variant_id) REFERENCES component_brand_variants (company_id, id),
  FOREIGN KEY (company_id, warehouse_id)               REFERENCES warehouses (company_id, id),
  FOREIGN KEY (company_id, warehouse_id, location_id)  REFERENCES storage_locations (company_id, warehouse_id, id)
);
CREATE INDEX ix_inv_txn_variant_wh ON inventory_transactions (component_brand_variant_id, warehouse_id);
CREATE INDEX ix_inv_txn_ref        ON inventory_transactions (ref_type, ref_id);
CREATE INDEX ix_inv_txn_created    ON inventory_transactions (created_at);

-- ============================================================================
--  PRODUCTION  (order header → items → material moves)
-- ============================================================================
CREATE TABLE production_orders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id),
  order_no     text NOT NULL,            -- PO-001 (production)
  product_id   uuid NOT NULL,
  bom_version_id uuid,                    -- snapshot: which BOM version this batch was built against
  qty          integer NOT NULL CHECK (qty > 0),
  status       prod_order_status NOT NULL DEFAULT 'Draft',
  target_date  date,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, product_id)     REFERENCES products (company_id, id),
  FOREIGN KEY (company_id, bom_version_id) REFERENCES bom_versions (company_id, id)
);
CREATE UNIQUE INDEX uq_prod_orders_no ON production_orders (company_id, order_no) WHERE deleted_at IS NULL;

-- STAGE 1 PLAN: exploded BOM demand. required_qty = pcb_lines.qty × product_pcbs.qty × order.qty
CREATE TABLE production_order_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id),
  production_order_id uuid NOT NULL,
  component_id        uuid NOT NULL,
  required_qty        numeric(14,3) NOT NULL,
  status              prod_item_status NOT NULL DEFAULT 'pending',
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, production_order_id) REFERENCES production_orders (company_id, id),
  FOREIGN KEY (company_id, component_id)        REFERENCES components (company_id, id)
);
CREATE INDEX ix_prod_items_order ON production_order_items (production_order_id);

-- STAGE 2/3 — MATERIAL MOVES: one table for both reservations and issues.
--   kind='allocation'  → reserve inventory (adjusts inventory_balances.reserved; NOT a ledger txn;
--                        released_at set when a reservation is freed without consuming)
--   kind='consumption' → issue to the build → appends inventory_transactions(type='CONSUMPTION')
CREATE TABLE production_material_moves (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                 uuid NOT NULL REFERENCES companies(id),
  production_order_item_id   uuid NOT NULL,
  kind                       material_move_kind NOT NULL,   -- 'allocation' | 'consumption'
  component_brand_variant_id uuid NOT NULL,
  warehouse_id               uuid NOT NULL,
  location_id                uuid NOT NULL,      -- bin reserved-from / issued-from
  qty                        numeric(14,3) NOT NULL CHECK (qty > 0),
  released_at                timestamptz,        -- allocation only: set when released w/o consuming
  moved_at                   timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, production_order_item_id)   REFERENCES production_order_items (company_id, id),
  FOREIGN KEY (company_id, component_brand_variant_id) REFERENCES component_brand_variants (company_id, id),
  FOREIGN KEY (company_id, warehouse_id)               REFERENCES warehouses (company_id, id),
  FOREIGN KEY (company_id, warehouse_id, location_id)  REFERENCES storage_locations (company_id, warehouse_id, id)
);
CREATE INDEX ix_pmm_item ON production_material_moves (production_order_item_id);
-- STAGE 4 COMPLETE: production_orders.status → 'Completed' + inventory_transactions(type='PRODUCTION').

-- ============================================================================
--  PURCHASE  (PR header/items → PO header/items → goods-in via inventory ledger)
-- ============================================================================
CREATE TABLE purchase_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id),
  pr_no        text NOT NULL,            -- PR-0001
  status       pr_status NOT NULL DEFAULT 'Draft',
  requested_by uuid REFERENCES users(id),
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  remarks      text,
  total_cost   numeric(14,2),            -- = Σ line totals (derived)
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, id)
);
CREATE UNIQUE INDEX uq_pr_no ON purchase_requests (company_id, pr_no) WHERE deleted_at IS NULL;

CREATE TABLE purchase_request_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id),
  purchase_request_id uuid NOT NULL,
  component_id        uuid NOT NULL,
  brand_id            uuid,             -- desired brand (optional)
  supplier_id         uuid,             -- recommended (finalized at PO)
  qty                 numeric(14,3) NOT NULL CHECK (qty > 0),
  unit_price          numeric(14,4),
  line_total          numeric(14,2),
  required_by         date,
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, purchase_request_id) REFERENCES purchase_requests (company_id, id),
  FOREIGN KEY (company_id, component_id)        REFERENCES components (company_id, id),
  FOREIGN KEY (company_id, brand_id)            REFERENCES brands (company_id, id),
  FOREIGN KEY (company_id, supplier_id)         REFERENCES suppliers (company_id, id)
);
CREATE INDEX ix_pr_items_pr ON purchase_request_items (purchase_request_id);

CREATE TABLE purchase_orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id),
  po_no       text NOT NULL,            -- PO-984302 (purchase)
  pr_id       uuid,                     -- sourced from
  supplier_id uuid NOT NULL,            -- ONE supplier per PO
  status      po_status NOT NULL DEFAULT 'Draft',
  order_date  date NOT NULL DEFAULT CURRENT_DATE,
  total_cost  numeric(14,2),
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, pr_id)       REFERENCES purchase_requests (company_id, id),
  FOREIGN KEY (company_id, supplier_id) REFERENCES suppliers (company_id, id)
);
CREATE UNIQUE INDEX uq_po_no ON purchase_orders (company_id, po_no) WHERE deleted_at IS NULL;

CREATE TABLE purchase_order_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id),
  purchase_order_id uuid NOT NULL,
  pr_item_id        uuid,             -- traceability PR line → PO line
  component_id      uuid NOT NULL,
  brand_id          uuid,
  qty               numeric(14,3) NOT NULL CHECK (qty > 0),
  unit_price        numeric(14,4),
  line_total        numeric(14,2),
  received_qty      numeric(14,3) NOT NULL DEFAULT 0,   -- running total = Σ IN ledger txns (ref='purchase_order_item')
  created_by  uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, purchase_order_id) REFERENCES purchase_orders (company_id, id),
  FOREIGN KEY (company_id, pr_item_id)        REFERENCES purchase_request_items (company_id, id),
  FOREIGN KEY (company_id, component_id)      REFERENCES components (company_id, id),
  FOREIGN KEY (company_id, brand_id)          REFERENCES brands (company_id, id)
);
CREATE INDEX ix_po_items_po ON purchase_order_items (purchase_order_id);

-- Goods-in has NO separate table: receiving a PO line appends an inventory ledger
-- row (type='IN', ref_type='purchase_order_item', ref_id=po_item, optional grn_no)
-- and rolls up purchase_order_items.received_qty. One ledger, one source of truth.

-- ============================================================================
--  WORKFLOW / APPROVALS
-- ============================================================================
-- Generic approval audit trail — one row per approval STEP on any document.
-- Today: purchase_requests (manager, procurement). Reusable for future flows
-- (production orders, BOM releases, …) via the polymorphic entity_type/entity_id.
-- Polymorphic ref (entity_type/entity_id) can't be composite-FK'd — company_id
-- carries tenancy and RLS confines the row; the app resolves entity_id in-tenant.
CREATE TABLE approvals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id),
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
CREATE INDEX ix_approvals_entity ON approvals (company_id, entity_type, entity_id);

-- ============================================================================
--  NOTIFICATIONS
-- ============================================================================
-- Lightweight per-user feed (shortages, low stock, approval requests, …).
-- Append + mark-read; exempt from the full audit convention like other logs.
-- Tenant-scoped: a notification belongs to a (company, user) pair.
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
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
CREATE INDEX ix_notifications_user_unread ON notifications (company_id, user_id) WHERE is_read = false;

-- ============================================================================
--  AUDIT LOG  (field-level change history — append-only, trigger-populated)
-- ============================================================================
-- The row-level audit columns (created_by/updated_by/…) say who touched a row
-- LAST. This says what each FIELD was before and after, on every write, forever.
-- Answers "who changed the supplier price yesterday, and from what?"
-- Immutable like inventory_transactions: no updated_*/deleted_at; written only by
-- the log_field_changes() trigger below, never by hand.
CREATE TABLE audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES companies(id),   -- NULL for global-table edits (users)
  entity      text  NOT NULL,        -- table name, e.g. 'supplier_component_prices'
  entity_id   uuid  NOT NULL,        -- the affected row's id
  action      audit_action NOT NULL, -- INSERT | UPDATE | DELETE
  field       text,                  -- changed column (NULL on whole-row INSERT/DELETE)
  old_value   jsonb,                 -- prior value (typed via jsonb; NULL on INSERT)
  new_value   jsonb,                 -- new value  (NULL on DELETE / for whole-row DELETE snapshot)
  changed_by  uuid REFERENCES users(id),   -- from app.current_user_id, else row's updated_by/created_by
  changed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_entity ON audit_logs (company_id, entity, entity_id, changed_at);
CREATE INDEX ix_audit_actor  ON audit_logs (changed_by, changed_at);
CREATE INDEX ix_audit_field  ON audit_logs (entity, field, changed_at);  -- "history of supplier prices"
-- High-churn over time → a monthly RANGE partition on changed_at is the natural
-- scaling step (out of scope here; the shape above is partition-ready).

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

-- 2) Project the ledger into inventory_balances.on_hand. The ONLY writer of on_hand.
--    Carries company_id through so the balance row is tenant-stamped.
CREATE OR REPLACE FUNCTION apply_inventory_txn() RETURNS trigger AS $$
BEGIN
  INSERT INTO inventory_balances (company_id, component_brand_variant_id, warehouse_id, location_id, on_hand)
  VALUES (NEW.company_id, NEW.component_brand_variant_id, NEW.warehouse_id, NEW.location_id, NEW.qty_delta)
  ON CONFLICT (component_brand_variant_id, location_id)
  DO UPDATE SET on_hand = inventory_balances.on_hand + EXCLUDED.on_hand, updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_apply_inventory_txn
  AFTER INSERT ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION apply_inventory_txn();

-- 3) Maintain inventory_balances.reserved from ALLOCATION material-moves (available is generated).
--    Only kind='allocation' rows touch reserved; consumptions hit the ledger instead.
CREATE OR REPLACE FUNCTION apply_allocation() RETURNS trigger AS $$
BEGIN
  IF NEW.kind <> 'allocation' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    UPDATE inventory_balances SET reserved = reserved + NEW.qty, updated_at = now()
     WHERE component_brand_variant_id = NEW.component_brand_variant_id
       AND location_id = NEW.location_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.released_at IS NOT NULL AND OLD.released_at IS NULL THEN
    UPDATE inventory_balances SET reserved = reserved - NEW.qty, updated_at = now()
     WHERE component_brand_variant_id = NEW.component_brand_variant_id
       AND location_id = NEW.location_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_apply_allocation
  AFTER INSERT OR UPDATE ON production_material_moves
  FOR EACH ROW EXECUTE FUNCTION apply_allocation();

-- NOTE (application/service layer, not shown as triggers to keep effects explicit):
--   • goods-in (receive PO line) → inventory_transactions(type='IN', ref='purchase_order_item')
--                                  + bump po_item.received_qty
--   • material move kind='consumption' → inventory_transactions(type='CONSUMPTION') + release reservation
--   • production complete     → inventory_transactions(type='PRODUCTION') into finished-goods wh
--   • TRANSFER                → two ledger rows sharing transfer_group_id (−source, +dest)

-- 4) Field-level audit log. AFTER INSERT/UPDATE/DELETE, diff the row and append
--    one audit_logs entry per changed field. SECURITY DEFINER so it can write the
--    log (incl. NULL-company rows for global tables) regardless of RLS context.
--    Actor = app.current_user_id GUC, falling back to the row's updated_by/created_by.
CREATE OR REPLACE FUNCTION log_field_changes() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_actor uuid := current_user_id();
  v_old jsonb; v_new jsonb; v_company uuid; v_id uuid; k text;
  noise text[] := ARRAY['created_at','updated_at','created_by','updated_by'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    INSERT INTO audit_logs(company_id, entity, entity_id, action, field, old_value, new_value, changed_by)
    VALUES ((v_new->>'company_id')::uuid, TG_TABLE_NAME, (v_new->>'id')::uuid,
            'INSERT', NULL, NULL, v_new - noise,
            COALESCE(v_actor, (v_new->>'created_by')::uuid));
    RETURN NULL;
  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    INSERT INTO audit_logs(company_id, entity, entity_id, action, field, old_value, new_value, changed_by)
    VALUES ((v_old->>'company_id')::uuid, TG_TABLE_NAME, (v_old->>'id')::uuid,
            'DELETE', NULL, v_old - noise, NULL, v_actor);
    RETURN NULL;
  ELSE  -- UPDATE: one row per field that actually changed
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
    v_company := (v_new->>'company_id')::uuid;
    v_id      := (v_new->>'id')::uuid;
    v_actor   := COALESCE(v_actor, (v_new->>'updated_by')::uuid);
    FOR k IN SELECT jsonb_object_keys(v_new) LOOP
      IF k = ANY(noise) THEN CONTINUE; END IF;
      IF (v_old->k) IS DISTINCT FROM (v_new->k) THEN
        INSERT INTO audit_logs(company_id, entity, entity_id, action, field, old_value, new_value, changed_by)
        VALUES (v_company, TG_TABLE_NAME, v_id, 'UPDATE', k, v_old->k, v_new->k, v_actor);
      END IF;
    END LOOP;
    RETURN NULL;
  END IF;
END; $$;

-- Attach to audited tables (those with a uuid `id`; excludes machine-maintained
-- ledgers/projections — inventory_balances, inventory_transactions, production_material_moves,
-- notifications — and the composite-PK grant link role_permissions, which has no id).
DO $$
DECLARE t text;
  audited text[] := ARRAY[
    'companies','users','company_memberships','roles',
    'brands','suppliers','warehouses','storage_locations',
    'components','pcbs','pcb_revisions','products','bom_versions',
    'product_pcbs','pcb_lines','component_brand_variants','supplier_component_prices',
    'production_orders','production_order_items',
    'purchase_requests','purchase_request_items','purchase_orders','purchase_order_items',
    'approvals'
  ];
BEGIN
  FOREACH t IN ARRAY audited LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_audit AFTER INSERT OR UPDATE OR DELETE ON %1$I
         FOR EACH ROW EXECUTE FUNCTION log_field_changes()', t);
  END LOOP;
END $$;

-- ============================================================================
--  ROW-LEVEL SECURITY  (tenant isolation — the runtime guard)
-- ============================================================================
-- The app opens each request/transaction with:
--     SET LOCAL app.current_company_id = '<uuid>';   -- the active company
--     SET LOCAL app.current_user_id    = '<uuid>';   -- the authenticated user
-- Every tenant table then only exposes/accepts rows for that company. Even a
-- query that forgets its WHERE company_id filter cannot see another tenant.
-- Run the app under a role that is NOT the table owner and is NOT BYPASSRLS.

CREATE OR REPLACE FUNCTION current_company_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('app.current_company_id', true), '')::uuid
$$;
CREATE OR REPLACE FUNCTION current_user_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

-- Enable RLS + a company-isolation policy + a company_id index on every
-- tenant-owned table. company_memberships/companies get bespoke policies below.
DO $$
DECLARE t text;
  tenant_tables text[] := ARRAY[
    'roles','role_permissions',
    'brands','suppliers','warehouses','storage_locations',
    'components','pcbs',
    'pcb_revisions','products','bom_versions',
    'product_pcbs','pcb_lines','component_brand_variants',
    'supplier_component_prices',
    'inventory_balances','inventory_transactions',
    'production_orders','production_order_items','production_material_moves',
    'purchase_requests','purchase_request_items','purchase_orders','purchase_order_items',
    'approvals','notifications'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format($pol$
      CREATE POLICY tenant_isolation ON %I
        USING (company_id = current_company_id())
        WITH CHECK (company_id = current_company_id())
    $pol$, t);
    EXECUTE format('CREATE INDEX ix_%1$s_company ON %1$I (company_id)', t);
  END LOOP;
END $$;

-- companies: a user sees only the companies they are a member of.
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE  ROW LEVEL SECURITY;
CREATE POLICY company_member_visibility ON companies
  USING (id IN (
    SELECT m.company_id FROM company_memberships m
    WHERE m.user_id = current_user_id() AND m.deleted_at IS NULL
  ));

-- company_memberships: a user sees ALL of their own memberships (needed by the
-- company switcher), plus admins can manage members of the active company.
ALTER TABLE company_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_memberships FORCE  ROW LEVEL SECURITY;
CREATE POLICY membership_access ON company_memberships
  USING (user_id = current_user_id() OR company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

-- audit_logs: read-only to the app, scoped to the active company. NOT forced —
-- the SECURITY DEFINER audit trigger (table owner) must always be able to append,
-- including NULL-company rows for edits to global tables. No INSERT/UPDATE/DELETE
-- policy exists, so the app role can only SELECT — the log is immutable to it.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON audit_logs
  FOR SELECT USING (company_id = current_company_id());

-- users is GLOBAL (no RLS): shared identity pool. Access is mediated by the service layer.

-- ============================================================================
--  SEED / BOOTSTRAP  (first-run: create tenant #1 so the app has a context)
-- ============================================================================
-- Runs as the schema owner (RLS is bypassed by the owner, or run before the app
-- role is switched in). Establishes one company, one admin user, their
-- membership, and an Admin role granted every permission. Idempotent-ish:
-- guarded by ON CONFLICT on the natural keys.

DO $$
DECLARE
  v_company uuid;
  v_user    uuid;
  v_role    uuid;
BEGIN
  INSERT INTO companies (code, name) VALUES ('STACKIOT', 'StackIOT')
    ON CONFLICT DO NOTHING;
  SELECT id INTO v_company FROM companies WHERE lower(code) = 'stackiot' AND deleted_at IS NULL;

  INSERT INTO users (name, email, is_active) VALUES ('Administrator', 'admin@stackiot.local', true)
    ON CONFLICT DO NOTHING;
  SELECT id INTO v_user FROM users WHERE lower(email) = 'admin@stackiot.local' AND deleted_at IS NULL;

  -- Admin role first, so the membership can pin role_id.
  INSERT INTO roles (company_id, name, description)
    VALUES (v_company, 'Admin', 'Full access to the tenant')
    ON CONFLICT DO NOTHING;
  SELECT id INTO v_role FROM roles WHERE company_id = v_company AND name = 'Admin' AND deleted_at IS NULL;

  INSERT INTO company_memberships (company_id, user_id, role_id, is_default, status)
    VALUES (v_company, v_user, v_role, true, 'active')
    ON CONFLICT DO NOTHING;

  -- Grant the Admin role the whole (resource, action) matrix directly (no catalog table).
  INSERT INTO role_permissions (company_id, role_id, resource, action)
  SELECT v_company, v_role, g.r, g.a::permission_action FROM (
      SELECT r, a FROM (VALUES ('product'),('pcb'),('component'),('brand'),('supplier'),('warehouse')) res(r)
                    CROSS JOIN (VALUES ('view'),('create'),('edit'),('delete')) act(a)
      UNION ALL
      SELECT r, a FROM (VALUES ('purchase_request'),('purchase_order'),('production_order')) res(r)
                    CROSS JOIN (VALUES ('view'),('create'),('edit'),('delete'),('approve')) act(a)
      UNION ALL
      SELECT * FROM (VALUES
        ('report','view'),('report','export'),
        ('inventory','view'),('inventory','create'),('inventory','edit'),
        ('role','view'),('role','create'),('role','edit'),('role','delete')) x(r,a)
  ) g(r, a)
  ON CONFLICT DO NOTHING;
END $$;

-- ---- How the app opens a request (illustrative, not executed here) ----------
-- After authenticating and resolving the user's active company:
--     BEGIN;
--       SET LOCAL app.current_user_id    = '<user uuid>';
--       SET LOCAL app.current_company_id = '<company uuid>';
--       -- ... queries here see ONLY that company's rows ...
--     COMMIT;
-- Sanity check that isolation is live (should return only the active company):
--     SET app.current_user_id = '<user uuid>';
--     SELECT count(*) FROM components;   -- 0 until app.current_company_id is set

-- ============================================================================
--  MIGRATION ORDERING (create order matters — FKs reference earlier tables)
-- ============================================================================
-- 1. extensions + enum types
-- 2. companies                      (tenant root; everything FKs to it)
-- 3. users                          (global)
-- 4. company_memberships, roles (+ membership→role FK), role_permissions   (auth)
-- 5. masters: brands/suppliers → warehouses → storage_locations →
--    components → pcbs → pcb_revisions → products → bom_versions
-- 6. relationships (product_pcbs, pcb_lines, variants, prices)
-- 7. inventory_balances, inventory_transactions
-- 8. production_* , purchase_* , approvals, notifications, audit_logs
-- 9. triggers
-- 10. RLS helpers + policies         (LAST — needs every table to exist)
-- 11. seed/bootstrap                 (run as owner; RLS not yet in the way)
-- Retrofitting company_id onto an existing single-tenant DB instead would mean:
-- add the column nullable → backfill the sole company → set NOT NULL → drop &
-- recreate every unique index with company_id → rebuild FKs as composite →
-- enable RLS. Doing it now (all tables born tenant-aware) avoids that entirely.
