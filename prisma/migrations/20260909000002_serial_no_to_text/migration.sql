-- Convert serial_no from integer to text for formatted serial numbers
-- Format: {ITEM_CODE}-{LOT_NO}-{SEQ:0000}
ALTER TABLE item_serials ALTER COLUMN serial_no TYPE text USING serial_no::text;
