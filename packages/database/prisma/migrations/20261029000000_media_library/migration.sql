BEGIN;
CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  identity TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  type TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP(3)
);
CREATE INDEX media_assets_deleted_at_created_at_id_idx ON media_assets(deleted_at, created_at, id);
CREATE TABLE media_references (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  memory_id TEXT REFERENCES memories(id) ON DELETE CASCADE ON UPDATE CASCADE,
  page_id TEXT REFERENCES pages(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK ((memory_id IS NOT NULL)::int + (page_id IS NOT NULL)::int = 1),
  UNIQUE(asset_id, memory_id), UNIQUE(asset_id, page_id)
);
CREATE INDEX media_references_memory_id_idx ON media_references(memory_id);
CREATE INDEX media_references_page_id_idx ON media_references(page_id);

-- Preserve existing attachments and Markdown-only files before any detachment.
CREATE TEMP TABLE existing_media ON COMMIT DROP AS
SELECT a.url, a.type, a.metadata, a.created_at, a.memory_id, NULL::TEXT AS page_id FROM attachments a
UNION ALL
SELECT r[1], CASE WHEN r[1] ~* '\.(jpg|jpeg|png|webp|gif)$' THEN 'image/jpeg' ELSE 'application/octet-stream' END,
  NULL::JSONB, p.created_at, NULL::TEXT, p.id
FROM pages p CROSS JOIN LATERAL regexp_matches(p.body_markdown, $pattern$(/uploads/[^[:space:]<>"')]+)$pattern$, 'g') r
UNION ALL
SELECT r[1], CASE WHEN r[1] ~* '\.(jpg|jpeg|png|webp|gif)$' THEN 'image/jpeg' ELSE 'application/octet-stream' END,
  NULL::JSONB, m.created_at, m.id, NULL::TEXT
FROM memories m CROSS JOIN LATERAL regexp_matches(m.content, $pattern$(/uploads/[^[:space:]<>"')]+)$pattern$, 'g') r
WHERE NOT EXISTS (SELECT 1 FROM pages p WHERE p.linked_memory_id = m.public_id);
ALTER TABLE existing_media ADD COLUMN identity TEXT;
UPDATE existing_media SET identity = regexp_replace(regexp_replace(url, '[?#].*$', ''), '^(.*/posts/revival-[a-z0-9-]+)/[^/?#]+([?#].*)?$', '\1', 'i');
INSERT INTO media_assets(id, identity, url, type, metadata, created_at)
SELECT DISTINCT ON(identity) 'media-' || md5(identity), identity, url, type, metadata, created_at
FROM existing_media ORDER BY identity, (metadata IS NOT NULL) DESC, created_at;
INSERT INTO media_references(id, asset_id, memory_id, page_id)
SELECT DISTINCT 'ref-' || md5(e.identity || COALESCE(e.memory_id, e.page_id)), a.id, e.memory_id, e.page_id
FROM existing_media e JOIN media_assets a ON a.identity = e.identity;
UPDATE memories SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{isLongForm}',
  to_jsonb(length(content) > 220 OR EXISTS (SELECT 1 FROM pages p WHERE p.linked_memory_id = memories.public_id)));
COMMIT;
