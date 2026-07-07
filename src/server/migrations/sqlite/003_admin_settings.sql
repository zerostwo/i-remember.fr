create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index if not exists app_settings_updated_idx
  on app_settings (updated_at);
