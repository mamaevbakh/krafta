-- KRA-98 hotfix: split `ALTER TYPE … ADD VALUE 'catalog'` into its own
-- migration so the value commits before any subsequent statement
-- references it.
--
-- Why two files: Postgres errors with `unsafe use of new value "catalog"
-- of enum type translatable_entity_kind (SQLSTATE 55P04)` when the same
-- transaction both adds an enum value AND uses it. The KRA-90 / KRA-94
-- migrations didn't trip this because they didn't reference the enum
-- value inside their CREATE VIEW. KRA-98 does, in the catalog branch of
-- translation_completeness_view.
--
-- The migration runner wraps each .sql file in its own transaction, so
-- splitting the ALTER TYPE into a standalone file makes the new enum
-- value visible to the next migration (20260522110001…).
--
-- IF NOT EXISTS keeps reruns idempotent.

ALTER TYPE public.translatable_entity_kind ADD VALUE IF NOT EXISTS 'catalog';
