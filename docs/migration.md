# Migration Plan

## Phase 1: Current Architecture

Completed. The restored archive runtime is a static public experience patched by
`public/js/revival-runtime.js`, served by Vite or `server.mjs`, with SQLite
business logic in `src/server`.

## Phase 2: Visualization Boundary

Completed as a thin `packages/memory-engine` wrapper. The visual runtime itself
remains untouched until a parity test can validate a real move.

## Phase 3: Backend API

Started. `/api/v1/memories`, `/api/v1/search`, `/api/v1/users`, and
`/api/v1/assets` now sit beside legacy routes.

## Phase 4: Database

Started. SQLite migrations now include users, attachments, normalized tags, and
future AI metadata columns while preserving existing runtime tables.

## Phase 5: Admin

Deferred. `AGENTS.md` requires Figma confirmation before replacing the admin
experience.

## Phase 6: Deprecated Code Removal

Deferred. Remove legacy endpoints only after the public archive runtime no
longer calls them.
