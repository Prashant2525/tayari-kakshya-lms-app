-- Runs once when the dev volume is first created.
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Separate database for automated integration tests.
CREATE DATABASE tayari_kakshya_test;
\connect tayari_kakshya_test
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
