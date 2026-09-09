-- Link each serial to the lot it arrived in.
ALTER TABLE item_serials
  ADD COLUMN lot_id uuid REFERENCES item_lots(id);

CREATE INDEX ix_item_serials_lot ON item_serials (company_id, lot_id)
  WHERE deleted_at IS NULL;
