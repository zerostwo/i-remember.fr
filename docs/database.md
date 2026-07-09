# Database

The production backend targets PostgreSQL through Prisma. The schema lives at
`packages/database/prisma/schema.prisma`, and the generated client is exposed by
`@i-remember/database`.

SQLite runtime, import, and migration paths are removed. PostgreSQL through
Prisma is the only supported persistence layer for current development.

## Core Models

- `User`: email, password hash, role, timestamps, authored memories.
- `Memory`: title, content, author, visibility, status, optional coordinates,
  emotion, metadata, and future AI fields.
- `Attachment`: memory-linked asset URL, type, metadata.
- `Tag`: normalized tag name and slug.
- `MemoryTag`: many-to-many memory/tag join.
- `Comment`: memory-linked moderation queue with author, content, status, and
  metadata.
- `Page`: editable Markdown pages for footer/content management.
- `MenuItem`: public footer navigation targets for pages, memories, searches,
  external URLs, language, terms, and credits.
- `AppSetting`: deployment-level JSON settings such as default language and
  Umami tracking configuration.

## Future AI Fields

The Prisma schema includes JSON placeholders for embeddings and knowledge graph
data plus an `aiSummary` field. A dedicated vector store can be added beside
PostgreSQL without changing the public archive rendering path.

## Commands

```bash
pnpm db:generate
pnpm db:migrate
pnpm --filter @i-remember/database test
```
