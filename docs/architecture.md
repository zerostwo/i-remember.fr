# Architecture

The current migration keeps the public archive experience in place and builds
production seams around it.

## Apps

- `apps/web`: public website boundary. The visual source of truth remains root
  `index.html`, `fr.html`, `public/css/main.css`, and
  `public/js/revival-runtime.js`.
- `apps/admin`: admin dashboard boundary. The current implementation remains in
  `src/admin` until the Figma-approved admin UI is ready to move.
- `apps/api`: HTTP API boundary. Runtime entrypoint remains `server.mjs`.

## Packages

- `packages/memory-engine`: reusable wrapper for the preserved galaxy runtime.
- `packages/database`: exports the SQLite store and migration-backed data dir.
- `packages/storage`: local filesystem storage abstraction with the same
  `upload`, `delete`, and `getUrl` shape planned for an S3 adapter.
- `packages/types`: shared TypeScript API types.
- `packages/ui`: shared shadcn-style UI export surface.
- `packages/config`: shared route, language, and role constants.

## Preserved Surface

Do not move or rewrite these without a visual parity pass:

- `index.html`
- `fr.html`
- `public/css/main.css`
- `public/js/revival-runtime.js`
- `public/js/main.js`
- `public/img/*`
- `public/audio/*`
- `public/fonts/*`
