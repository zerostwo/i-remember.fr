# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added an installable standalone web app manifest, iPhone home-screen icons,
  theme/status-bar metadata, and automated mobile UX guardrails.
- Added the approved Figma V2 admin experience with responsive navigation,
  a keyboard-accessible Spotlight search, first-run setup, login, Dashboard,
  content management, and Site, Account, Security, and Backup settings.
- Added saveable site title, canonical URL, and timezone settings across the
  admin UI, shared contracts, API defaults, and one-image deployment config.
- Added a four-phase `songqi.org` launch plan covering clean-room debranding,
  the approved-admin design gate, workspace consolidation, and production
  cutover verification.
- Added persistent Memory view counts and one-level grouped Footer Menu items.
- Added an atomic PostgreSQL first-administrator claim, global setup
  throttling, and admin setup UI.
- Added database-aware public readiness, request-size/origin safeguards, trusted
  proxy peer handling, and per-client authentication/submission limits.
- Added checksum-verified PostgreSQL/assets/auth-secret backup and empty-volume
  restore commands plus fresh-volume, restart, backup, and restore smoke tests.

### Changed

- Raised mobile form, button, navigation, and modal typography and touch targets
  to iOS-friendly 16 px and 44 px minimums, lazy-loaded admin attachment
  thumbnails, and reduced the bundled ambient audio transfer size.
- Removed the installation-token requirement from first-owner setup and lowered
  the administrator password minimum to eight characters.
- Moved all admin implementation and v1 adapter sources into the
  `apps/admin` package boundary, and removed hidden Comments, Theme, and
  standalone Backup destinations from the launch navigation.
- Reduced the production image by installing only runtime dependencies after
  the monorepo build instead of copying the full development dependency tree.
- Pinned the production Node and PostgreSQL runtimes, bound Compose to loopback,
  required immutable release tags, and made pull requests exercise the complete
  one-image container lifecycle before merge.
- Made anonymous submission and Umami tracking opt-in on fresh installations,
  and removed the legacy FRM footer seed from new databases.
- Moved Memory editing to `/admin/memory/editor`, made long-form expansion
  automatic, and split Settings into Site, Account, and Security tabs.
- Made published Pages create and maintain their linked long-form Memory.

### Fixed

- Fixed iOS Safari input zoom, safe-area overlap, virtual-keyboard occlusion,
  modal scroll/focus handling, and unintended horizontal overflow across the
  public and admin experiences.
- Kept every real public Memory visible in the home galaxy and search when the
  UI display language changes, instead of treating language as a content filter.
- Assigned stable internal legacy IDs from each Memory public ID so direct
  Memory routes cannot collide with a different home-galaxy entry.
- Removed Untitled placeholder memories from the public galaxy and replaced the
  static fade value with recent published-memory activity.
- Restricted public Memory detail routes to language-free `/memory/:id`, fixed
  admin editor deep links, and made runtime Settings drive both public and admin
  behavior without stale compatibility fallbacks.
- Sanitized and rebuilt forwarding headers at the one-image boundary so trusted
  reverse proxies can preserve visitor-specific limits without accepting spoofed
  forwarding chains.
- Made type checking generate Prisma Client first so clean CI installations do
  not race database generation against package type checks.
- Moved 2FA password confirmation into the Security workflow and made all
  archive footer controls managed menu records.

## [0.1.5] - 2026-07-10

### Fixed

- Fixed public memory picture upload previews by keeping `/uploads/tmp/*` on
  the public upload handler instead of proxying those temporary images to the
  v1 asset API.

## [0.1.4] - 2026-07-10

### Added

- Added persistent single-image runtime logs under
  `/var/opt/i-remember.fr/logs/` for startup, app/API/web requests, and
  PostgreSQL.

### Fixed

- Fixed fresh one-image deployments so `/` redirects to `/admin/setup` while no
  admin user exists.
- Fixed admin Memory saves and attachment uploads by omitting immutable public
  memory IDs from v1 patch requests.
- Fixed admin error messages so backend validation details are shown instead of
  generic `Request failed: 400` text.
- Added structured v1 API and web proxy request logs so failed admin operations
  can be diagnosed from container logs and persisted log files.

## [0.1.3] - 2026-07-09

### Added

- Added official one-image, one-volume Docker deployment for
  `zerostwo/i-remember.fr` with an internal PostgreSQL runtime.
- Added durable admin Page metadata editing and v1 page metadata sync.
- Added local v1 asset serving from the API service and web/admin proxying for
  non-legacy upload URLs.

### Fixed

- Fixed Docker/local deployments where v1 upload URLs could point to files in
  the API asset volume that no HTTP service was serving.

## [0.1.2] - 2026-07-08

### Fixed

- Moved the Credits side-panel close control into the same top-left panel chrome
  used by Terms.

## [0.1.1] - 2026-07-08

### Added

- Seeded the managed footer menu with Donate, Terms, Credits, and Language on
  fresh self-hosted deployments.
- Added structured server logs for public requests, submissions, uploads, and
  searches.

### Changed

- Made anonymous public submissions searchable immediately by default.

### Fixed

- Fixed public language switching so it preserves the current route and updates
  UI text in-session.
- Improved desktop side panels and mobile header, search, footer, and touch
  affordances.

## [0.1.0] - 2026-07-08

### Added

- Added an explicit app version, `/version` endpoint, and release notes.
- Aligned the container defaults with the public install command: port `7890`,
  data directory `/var/opt/i-remember.fr`, and DockerHub image
  `zerostwo/i-remember.fr`.
- Added GitHub Actions publishing to DockerHub on `main` pushes and `v*` tags.
