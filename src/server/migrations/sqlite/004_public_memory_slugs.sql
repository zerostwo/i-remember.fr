update memories
set public_id = lower(hex(randomblob(10)))
where typeof(public_id) != 'text' or public_id not glob '*[A-Za-z]*';

create unique index if not exists memories_public_id_unique_idx
  on memories (public_id);
