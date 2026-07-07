create table if not exists schema_migrations (
  version text primary key,
  applied_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists languages (
  code text primary key,
  legacy_id text not null unique,
  name text not null,
  native_name text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

insert into languages (code, legacy_id, name, native_name)
values
  ('fr', '1', 'French', 'Francais'),
  ('en', '2', 'English', 'English'),
  ('zh', '3', 'Chinese', '中文')
on conflict(code) do update set
  legacy_id = excluded.legacy_id,
  name = excluded.name,
  native_name = excluded.native_name;

create table if not exists memory_images (
  image_key text primary key,
  storage_type text not null default 'ARCHIVE'
    check (storage_type in ('ARCHIVE', 'LOCAL', 'FALLBACK')),
  original_path text,
  resized_path text,
  thumb_path text,
  mime_type text not null default 'image/jpeg',
  width integer,
  height integer,
  sha256 text,
  fallback integer not null default 0 check (fallback in (0, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists memories (
  id integer primary key autoincrement,
  uid text not null unique,
  legacy_id integer not null,
  public_id integer not null,
  language_code text not null references languages(code),
  name text not null default 'I Remember',
  text text not null default '',
  image_key text not null default 'revival-upload',
  img_offset_x real not null default 0,
  img_offset_y real not null default 0,
  resized_img_width integer not null default 600,
  resized_img_height integer not null default 600,
  has_created_tags integer not null default 1 check (has_created_tags in (0, 1)),
  is_stared integer not null default 0 check (is_stared in (0, 1)),
  tags_json text,
  source text not null default 'submission',
  status text not null default 'PENDING'
    check (status in ('NORMAL', 'PENDING', 'ARCHIVED', 'REJECTED')),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (language_code, legacy_id),
  unique (language_code, public_id)
);

create index if not exists memories_language_status_legacy_idx
  on memories (language_code, status, legacy_id desc);

create index if not exists memories_image_key_idx
  on memories (image_key);
