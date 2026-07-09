# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
