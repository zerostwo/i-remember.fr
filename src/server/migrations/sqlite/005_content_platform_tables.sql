alter table memories add column visibility text not null default 'PUBLIC';
alter table memories add column latitude real;
alter table memories add column longitude real;
alter table memories add column emotion text;
alter table memories add column metadata_json text;
alter table memories add column embedding_json text;
alter table memories add column ai_summary text;
alter table memories add column knowledge_graph_json text;

create table if not exists users (
  id text primary key,
  email text not null unique,
  password_hash text not null,
  role text not null default 'USER'
    check (role in ('ADMIN', 'USER', 'ANONYMOUS')),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists attachments (
  id text primary key,
  memory_uid text not null references memories(uid) on delete cascade,
  url text not null,
  type text not null,
  metadata_json text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists tags (
  id text primary key,
  name text not null unique,
  slug text not null unique,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table if not exists memory_tags (
  memory_uid text not null references memories(uid) on delete cascade,
  tag_id text not null references tags(id) on delete cascade,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (memory_uid, tag_id)
);

create index if not exists memories_visibility_status_idx
  on memories (visibility, status, created_at desc);

create index if not exists attachments_memory_uid_idx
  on attachments (memory_uid);
