/*
 * Creates efficient full-text indexes to greatly speed up the native search feature.
 * This has no effect when an external search backend is enabled.
 */

-- Enable trigram matching. Required for compatibility with existing "LIKE"-based queries.
-- https://dba.stackexchange.com/a/165301
-- https://www.postgresql.org/docs/current/pgtrgm.html
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create the note index. This may take a while!
-- https://stackoverflow.com/a/13452528
-- https://www.postgresql.org/docs/current/textsearch-indexes.html
CREATE INDEX IF NOT EXISTS "IDX_note_text" ON note USING gin (text gin_trgm_ops);

-- Create the user indexes.
CREATE INDEX IF NOT EXISTS "IDX_user_name" ON "user" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "IDX_user_usernameLower" ON "user" USING gin ("usernameLower" gin_trgm_ops);
