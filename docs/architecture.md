# Architecture

The application uses pnpm/Turbo workspaces, a TypeScript API, PostgreSQL/Prisma,
and a single production image. The current owner decision preserves the restored
public galaxy and interactions; the July clean-room launch plan is historical.
See AGENTS.md for the evolving product decisions and LICENSE for asset rights.

## Applications and entries

- `apps/web`: workspace commands for the root Vite public/admin build.
- `index.html`, `fr.html`, `legal.html`: public entries and server templates.
- `admin.html`: the only admin HTML entry; mounts `apps/admin/src/main.jsx`.
- `apps/admin`: React owner interface, API adapters and their checks.
- `apps/api`: TypeScript HTTP controllers, services, validation, authentication
  and PostgreSQL repositories.

## Shared packages

- `packages/memory-engine`: memory normalization used by the public adapter.
- `packages/content`: safe Markdown rendering.
- `packages/database`: Prisma schema, migrations and client.
- `packages/storage`: local filesystem and S3-compatible storage abstraction.
- `packages/types`: shared API/domain contracts.
- `packages/ui`: checked-in UI primitive exports; local CSS state variants replace
  the unused shadcn generator dependency.
- `packages/config`: route, language and role constants.

## Public runtime

`server.mjs` and `src/server/revival.js` serve the public shell and connect its
search, memory, menu and submission requests to the versioned API. SEO is rendered
on the server. Media processing supports photos/GIFs, cropped previews, video
posters and FFmpeg conversion; video sessions use short chunk/status requests.

`public/js/main.js` remains the active WebGL/AMD renderer. `revival-runtime.js`
adapts it for current content, gestures, galleries, reading and circular upload
progress. Original CSS, fonts, sprites and audio remain active dependencies.
The removed iframe React wrapper was not part of this runtime.

## Build and deployment

`pnpm build` lets Turbo build the database then API, followed by one Vite build.
`pnpm test` runs package checks and server/public integration checks. Type checking
explicitly generates/builds the Prisma package before consumers run.

The root Dockerfile caches manifest-based dependency installation, builds source,
then installs production dependencies offline. Its runtime contains built web/API
assets, required server packages, FFmpeg, and PostgreSQL 15. The public source
assets/templates are also needed by the server adapter and are deliberately kept.
One persistent volume stores PostgreSQL data, uploads, auth secret and logs.
No SQLite runtime, separate admin image or separate database container is required.

See [deployment](deployment.md) and [the maintenance audit](maintenance-2026-10-18.md).
