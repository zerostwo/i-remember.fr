# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
