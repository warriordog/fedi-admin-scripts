/*
 * Creates an efficient full-text on "note.text" to greatly speed up the native search feature.
 * This has no effect when an external search backend is enabled.
 */

-- Enable trigram matching. Required for compatibility with existing "LIKE"-based queries.
-- https://dba.stackexchange.com/a/165301
-- https://www.postgresql.org/docs/current/pgtrgm.html
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create the index itself. This may take a while!
-- https://stackoverflow.com/a/13452528
-- https://www.postgresql.org/docs/current/textsearch-indexes.html
CREATE INDEX IF NOT EXISTS "IDX_note_text" ON note USING gin (text gin_trgm_ops);
