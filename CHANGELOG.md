# Changelog

## 0.1.2 - 2026-07-08

- Moved the Credits side-panel close control into the same top-left panel chrome
  used by Terms.

## 0.1.1 - 2026-07-08

- Made anonymous public submissions searchable immediately by default.
- Seeded the managed footer menu with Donate, Terms, Credits, and Language on
  fresh self-hosted deployments.
- Added structured server logs for public requests, submissions, uploads, and
  searches.
- Fixed public language switching so it preserves the current route and updates
  UI text in-session.
- Improved desktop side panels and mobile header, search, footer, and touch
  affordances.

## 0.1.0 - 2026-07-08

- Added an explicit app version, `/version` endpoint, and release notes.
- Aligned the container defaults with the public install command: port `7890`,
  data directory `/var/opt/i-remember.fr`, and DockerHub image
  `zerostwo/i-remember.fr`.
- Added GitHub Actions publishing to DockerHub on `main` pushes and `v*` tags.
