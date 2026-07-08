# Changelog

## 0.1.0 - 2026-07-08

- Added an explicit app version, `/version` endpoint, and release notes.
- Aligned the container defaults with the public install command: port `7890`,
  data directory `/var/opt/i-remember.fr`, and DockerHub image
  `zerostwo/i-remember.fr`.
- Added GitHub Actions publishing to DockerHub on `main` pushes and `v*` tags.
