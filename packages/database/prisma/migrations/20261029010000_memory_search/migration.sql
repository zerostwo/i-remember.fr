-- Generated in PostgreSQL so imports and Page mirrors share the same search data.
-- normalize() is built into PostgreSQL 15; no optional extension is required.
ALTER TABLE memories ADD COLUMN search_text TEXT GENERATED ALWAYS AS (
  trim(regexp_replace(lower(regexp_replace(normalize(
    title || ' ' || COALESCE(excerpt, '') || ' ' || COALESCE(author_name, '') || ' ' || content COLLATE "und-x-icu",
    NFD), U&'[\0300-\036f]', '', 'g')), '[^[:alnum:]]+', ' ', 'g'))
) STORED NOT NULL;
