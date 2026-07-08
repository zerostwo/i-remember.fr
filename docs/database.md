# Database

The app uses SQLite by default, stored in the app-local data directory selected
by `I_REMEMBER_DATA_DIR`. This follows the current self-hosted product decision
in `AGENTS.md`.

Migration source lives in `src/server/migrations/sqlite`.

## Core Tables

- `memories`: public memory cards, long-form memory content, language, status,
  public random ID, optional coordinate fields, metadata, and future AI fields.
- `memory_images`: local or archive image records.
- `pages`: editable Markdown pages mirrored into long-form memories.
- `menu_items`: public lower-right footer navigation.
- `app_settings`: site, admin, language, and tracking settings.
- `users`: future multi-user accounts.
- `attachments`: future memory attachments.
- `tags` and `memory_tags`: future normalized tagging.

## Future Adapters

PostgreSQL and Prisma are not introduced in this migration because the current
repo decision is SQLite-first. The schema now has stable entities that can be
mapped to a PostgreSQL adapter later without changing the public archive runtime.
