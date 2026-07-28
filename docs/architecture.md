# Architecture

The production foundation is separated into applications and shared packages.
Admin and public presentation are independent delivery stages: the Figma V2
admin is implemented as a private owner control surface, while the public site
must cross the clean-room replacement gate before launch.

## Apps

- `apps/web`: public website boundary and `MemoryGalaxy` export.
- `apps/admin`: complete Figma V2 admin application. The active entry is
  `apps/admin/src/main.jsx`; UI, API adapters, and adapter checks are package
  local.
- `apps/api`: standalone TypeScript REST API with controller, service,
  repository, validation, and auth layers.

## Packages

- `packages/memory-engine`: reusable memory galaxy component boundary.
- `packages/database`: Prisma schema and PostgreSQL client.
- `packages/storage`: local filesystem and S3-compatible storage abstraction.
- `packages/types`: shared API/domain types.
- `packages/ui`: shared shadcn-style component exports.
- `packages/config`: shared route, language, and role constants.

## Public clean-room boundary

The following files still form the temporary archive migration shell:

- `index.html`
- `fr.html`
- `public/css/main.css`
- `public/js/revival-runtime.js`
- `public/js/main.js`
- `public/img/*`
- `public/audio/*`
- `public/fonts/*`

They are not a launch design contract and must not be treated as approved
`songqi.org` branding. Public launch requires replacing operator identity, copy,
legal text, media, fonts, and trade dress while preserving the memory-galaxy
interaction model and current PostgreSQL API behavior. SQLite-backed runtime
and compatibility paths remain removed.
