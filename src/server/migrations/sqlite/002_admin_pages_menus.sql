alter table memories add column title text;
alter table memories add column excerpt text;
alter table memories add column body_markdown text;
alter table memories add column content_format text not null default 'plain';
alter table memories add column is_long_form integer not null default 0
  check (is_long_form in (0, 1));

create table if not exists pages (
  id integer primary key autoincrement,
  slug text not null,
  language_code text not null references languages(code),
  title text not null,
  excerpt text not null default '',
  body_markdown text not null default '',
  status text not null default 'DRAFT'
    check (status in ('PUBLISHED', 'DRAFT', 'ARCHIVED')),
  linked_memory_uid text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (language_code, slug)
);

create index if not exists pages_language_status_idx
  on pages (language_code, status, slug);

create table if not exists menu_items (
  id integer primary key autoincrement,
  uid text not null,
  language_code text not null references languages(code),
  label text not null,
  item_type text not null default 'PAGE'
    check (item_type in ('PAGE', 'MEMORY', 'SEARCH', 'EXTERNAL', 'TERMS', 'CREDITS', 'LANGUAGE')),
  target_value text,
  url text,
  position integer not null default 0,
  is_visible integer not null default 1 check (is_visible in (0, 1)),
  opens_new_tab integer not null default 0 check (opens_new_tab in (0, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (language_code, uid)
);

create index if not exists menu_items_language_visible_position_idx
  on menu_items (language_code, is_visible, position);
