-- Rename item_type enum values to match the new UI terminology:
--   semi_assembled → sub_assembly
--   assembled      → finished_product
--
-- ALTER TYPE … RENAME VALUE is safe (PostgreSQL 10+), transactional,
-- and automatically updates every column that uses the enum — no row
-- rewrite needed.

ALTER TYPE item_type RENAME VALUE 'semi_assembled' TO 'sub_assembly';
ALTER TYPE item_type RENAME VALUE 'assembled' TO 'finished_product';
