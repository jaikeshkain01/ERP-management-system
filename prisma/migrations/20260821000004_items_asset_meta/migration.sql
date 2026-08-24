-- ============================================================================
--  ADD-FORM P8 — items asset-register metadata
-- ============================================================================
-- Fields the asset register cares about: who holds it, when it was bought,
-- what it cost, how long the warranty runs, how it depreciates, and what
-- condition it's currently in. All optional at the schema level — an asset
-- can be booked with only a name until the desk assigns it, and a
-- non-depreciable tool can leave the amortisation fields NULL.
--
-- Items-only (no components dual-write — legacy `components` never had these).
-- Meaningful only for `asset` item_type; the UI disables the chip otherwise,
-- but the DB does not enforce that — nothing here is inherently invalid on
-- another item type, and forbidding it now would foreclose future uses
-- (a spare consumable could still carry a serial, for example).
--
-- Apply with:  npx prisma migrate deploy

-- 1) Enums
CREATE TYPE item_condition_kind    AS ENUM ('new', 'good', 'fair', 'poor', 'retired');
CREATE TYPE item_depreciation_kind AS ENUM ('none', 'straight_line', 'reducing_balance');

-- 2) Columns
ALTER TABLE items
  ADD COLUMN custodian_user_id      uuid REFERENCES users(id),
  ADD COLUMN serial_number          text,
  ADD COLUMN purchase_date          date,
  ADD COLUMN purchase_cost          numeric(14,2)
    CHECK (purchase_cost IS NULL OR purchase_cost >= 0),
  ADD COLUMN warranty_months        integer
    CHECK (warranty_months IS NULL OR warranty_months >= 0),
  ADD COLUMN useful_life_months     integer
    CHECK (useful_life_months IS NULL OR useful_life_months > 0),
  ADD COLUMN salvage_value          numeric(14,2)
    CHECK (salvage_value IS NULL OR salvage_value >= 0),
  ADD COLUMN depreciation_method    item_depreciation_kind,
  ADD COLUMN condition_kind         item_condition_kind;

-- Salvage value should not exceed the purchase cost (when both are set); a
-- salvage above cost would break depreciation math on day one.
ALTER TABLE items
  ADD CONSTRAINT items_salvage_le_cost CHECK (
    salvage_value IS NULL
    OR purchase_cost IS NULL
    OR salvage_value <= purchase_cost
  );

-- Uniqueness on serial numbers per tenant — two of the same serial makes no
-- physical sense. Partial: NULL and empty deleted rows do not collide.
CREATE UNIQUE INDEX uq_items_serial_number
  ON items (company_id, serial_number)
  WHERE deleted_at IS NULL AND serial_number IS NOT NULL AND serial_number <> '';

-- Filters we expect the asset-register views to key off.
CREATE INDEX ix_items_custodian ON items (company_id, custodian_user_id) WHERE deleted_at IS NULL AND custodian_user_id IS NOT NULL;
CREATE INDEX ix_items_condition ON items (company_id, condition_kind)    WHERE deleted_at IS NULL AND condition_kind    IS NOT NULL;
