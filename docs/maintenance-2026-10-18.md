# Maintenance audit — 2026-10-18

Scope: simplify unused code and build tooling while preserving the current public
and admin features, visual relationships and interaction sequences.

## Removed or consolidated

- Three unreferenced app-specific Dockerfiles; root Dockerfile/Compose/CI remain
  the single production path.
- Duplicate `apps/admin/index.html`; root `admin.html` is the active Vite entry.
- Unused React iframe galaxy adapter, its web re-export/typecheck shell, unused
  runtime-path export/alias and session-storage dataset override. The public
  renderer never mounted this wrapper.
- Three obsolete app icons; manifest and Apple touch metadata use memory-mark icons.
- Duplicate API test launcher and placeholder web/admin import checks; real admin
  adapter checks now run in their workspace, and root integration checks remain.
- shadcn generator CLI. Existing JSX primitives and required state variants remain,
  with upstream MIT attribution retained in the extracted CSS.

## Build changes

Turbo builds the database before API consumers and API output before its checks.
The root test command explicitly scopes workspace tests, avoiding root recursion.
Docker installs from manifests before copying source, uses the same build command,
installs runtime dependencies offline, and copies only required server packages.
Docker context excludes local QA output, nested build/cache directories and docs.

Lockfile package entries decreased from **749 to 518** (231 fewer). This is a
build/dependency reduction, not a claim of 231 fewer production dependencies.
Local generated `dist` decreased from 8,846,669 to 8,683,453 bytes, including
compressed outputs. Most application payloads are deliberately unchanged.

## Preserved intentionally

- Active WebGL/AMD galaxy bundle, runtime adapter, CSS, fonts, sprites, audio formats
  and social callback paths. Their age alone is not evidence they are unused.
- PostgreSQL migration history, storage adapters, FFmpeg/ffprobe, media session
  cleanup, existing albums and short/custom memory URL redirects.
- Public source templates/assets alongside `dist`: server HTML patching, hashes
  and fallback routes still need them.
- pnpm/Turbo workspace boundaries and one-image PostgreSQL deployment architecture.
- Historical audit notes, with superseded launch/design conclusions marked clearly.

## Validation

- Passed lint, typecheck, production build, package/integration checks and actual
  FFmpeg video regression checks.
- Production dependency audit: no high/critical advisories; 12 moderate and one
  low advisory remain. No dependency version upgrades were mixed into this cleanup.
- Compared compiled admin CSS rules: component rules/state selectors unchanged;
  only unused shimmer/scroll-fade support rules/properties removed.
- Compared generated public assets against the pre-cleanup build: the only changes
  were the removed unused icons and dead session-storage wrapper code (including
  its compressed copies). Existing galaxy, audio, fonts and styles were unchanged.
- Browser checks cover local long-form opening/closing and the admin login surface.
  Full container build/start/restart/backup/restore checks are provided by the
  existing Docker workflow; source checks alone do not establish container health.

No migration or production data mutation is part of this cleanup.

## Deployment follow-up

Live search verification caught a dangling call into the removed dataset wrapper.
The first cleanup image was rolled back before continuing validation. The remaining
unused dataset AJAX helpers were removed, and regression checks now exercise the
actual network adapter for search, autocomplete and related counts without stubbing
that obsolete layer. Public search is also checked in the browser before redeployment.
