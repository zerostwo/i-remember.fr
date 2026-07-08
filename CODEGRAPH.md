# Codegraph

Use this as the repo map before editing.

## Runtime Flow

```text
npm run dev
  -> vite.config.mjs
  -> createViteRevivalPlugin()
  -> createRevivalMiddleware()
  -> RevivalBackend
  -> RevivalSQLiteStore
  -> src/server/migrations/sqlite/*.sql

npm start
  -> server.mjs
  -> createRevivalMiddleware({ production: true })
  -> dist static files fallback
```

## Memos-Inspired Boundaries

The upstream `usememos/memos` repo splits product code by purpose: server,
store, web, scripts, docs, and release metadata. This project keeps the same
boundary without copying the Go-specific `cmd/internal` layout:

- `src/server/`: HTTP middleware, APIs, auth, uploads, settings, and SQLite
  store wiring.
- `src/server/migrations/sqlite/`: durable schema migrations.
- `src/admin/` and `src/components/`: Vite admin web app and local UI
  primitives.
- `public/`, `index.html`, `fr.html`, `legal.html`: restored public archive
  shell and vendor-like legacy assets.
- `scripts/`: one-off operational/import scripts.
- `Dockerfile`, `docker-compose.yml`, `.github/workflows/`: app-only release
  path.

## Public App

- `index.html`: restored English archive shell and embedded default post data.
- `fr.html`: restored French archive shell and embedded default post data.
- `legal.html`: restored legal page served at legal routes.
- `public/js/main.js`: restored bundled legacy 3D/archive app. Treat as vendor-like.
- `public/js/revival-runtime.js`: compatibility layer that adapts the legacy app to local APIs.
- `public/css/main.css`: restored public app styling.
- `public/css/legal.css`: restored legal page styling.
- `public/img/*`: public app sprites/background/color-map/thumbnail assets.
- `public/audio/*`: public app sound loops/effects.
- `public/fonts/*`: restored public app fonts.
- `public/js/static/modernizr.js`: legacy feature detection used by the restored shell.
- `public/api/instagram-token-callback`: static callback page kept for legacy routes.
- `public/close.html`: legacy close window helper.
- `public/uploads/posts/revival-upload/*.jpg`: required fallback memory images. Other `public/uploads` files are recovered/runtime assets and stay untracked.

## Backend

- `src/server/revival.js`: main HTTP middleware, public API, admin API, HTML patching, upload handling, archive seeding, settings, and auth.
- `src/server/sqlite-store.js`: SQLite connection, migrations, prepared statements, and row normalization.
- `src/server/migrations/sqlite/*.sql`: source migrations applied at startup.
- `server.mjs`: production Node static server plus backend middleware.
- `scripts/import-sqlite.mjs`: one-shot archive import script through the same backend.

## Admin App

- `admin.html`: Vite entry for admin.
- `src/admin/main.jsx`: React mount.
- `src/admin/AdminApp.jsx`: admin routes, data loading, CRUD screens, login, settings, 2FA UI.
- `src/admin/admin.css`: admin-specific layout/polish.
- `src/index.css`: Tailwind/shadcn theme tokens shared by admin components.
- `src/components/ui/*.jsx`: local shadcn-style primitives.
- `src/lib/utils.js`: shared `cn()` class helper.

## Build And Deployment

- `vite.config.mjs`: Vite React/Tailwind config and backend dev/preview middleware.
- `package.json`: npm scripts and dependency boundary.
- `package-lock.json`: locked npm dependency graph.
- `Dockerfile`: app-only production image.
- `docker-compose.yml`: local container runtime and DockerHub image env wiring.
- `.dockerignore`: excludes generated/runtime material from Docker context.
- `.gitignore`: excludes generated/runtime material from Git while allowing required source migrations and fallback images.
- `.env.example`: supported deployment environment variables.

## Documentation

- `AGENTS.md`: repo-specific agent/product decisions.
- `README.md`: operator overview.
- `BACKEND.md`: backend architecture notes.
- `REVIVAL_NOTES.md`: restoration and QA history.
- `design-qa.md`: visual QA notes and archive asset recovery notes.
- `LICENSE`: source-available/third-party material notice.
- `components.json`: shadcn component config.
- `jsconfig.json`: editor/import path config.
- `.npmrc`: npm install behavior.

## Generated Or Local Only

- `dist/`: build output.
- `.revival-data/`: local SQLite database and upload data.
- `.revival-storage/`: legacy prototype runtime upload store.
- `public/uploads/posts/*` except `revival-upload`: recovered archive thumbnails or runtime assets.
- `public/uploads/tmp/`: runtime upload scratch space.
- `node_modules/`: installed dependencies.
- `qa/`, `data/`, `db/`: generated QA/import/runtime data when present.
- `supabase/`: obsolete if empty; current backend is SQLite, not Supabase.

## Edit Targets

- Public route/API behavior: start in `src/server/revival.js`, then check `public/js/revival-runtime.js`.
- SQLite schema or persistence: `src/server/migrations/sqlite/*.sql` plus `src/server/sqlite-store.js`.
- Admin UI behavior: `src/admin/AdminApp.jsx`; add UI primitives only if existing `src/components/ui/*` cannot cover it.
- Public visual shell: prefer `public/js/revival-runtime.js` or server HTML patches; edit `public/js/main.js` only as last resort.
- Docker publish issues: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `.env.example`.
