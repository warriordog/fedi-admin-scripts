/*
 * Removes the index created by create-full-text-index.sql.
 */

DROP INDEX IF EXISTS "idx_note_text";

-- Comment this out if you use pg_trgm for other uses.
DROP EXTENSION IF EXISTS pg_trgm;