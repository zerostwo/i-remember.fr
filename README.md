# I Remember Revival

Self-hosted revival and personal-blog backend for the restored `i-remember.fr`
frontend.

This repository keeps the public archive UI visually close to the original site,
while replacing the backend with a local SQLite server, editable admin system,
anonymous memory submissions, footer menu management, and configurable Umami
tracking.

## Current Scope

- Public archive frontend with English, French, and Chinese routes.
- Anonymous public memory submission with moderation status.
- Admin login with real password validation, session cookies, and optional TOTP
  2FA.
- Admin modules for Dashboard, Memory, Pages, Comments, Attachments, Theme,
  Menus, Settings, and Backups.
- Settings for default language, anonymous submissions, and self-hosted Umami
  tracking.
- SQLite storage in an app-local data directory.
- Local filesystem image storage for uploaded memories.

## Runtime

```bash
npm install
npm run build
npm start
```

The server listens on `PORT` and `HOST` from the environment. The default local
URL is `http://127.0.0.1:7890/`.

Admin is available at `/admin/`.

On a fresh database, the first visit redirects to `/admin/setup` so you can
create the first administrator.

The running app exposes its build version at `/version`.

## Docker

```bash
docker run -d \
  --name i-remember.fr \
  -p 7890:7890 \
  -v ~/.i-remember.fr:/var/opt/i-remember.fr \
  zerostwo/i-remember.fr:latest
```

## Configuration

Copy `.env.example` into your deployment environment and set:

- `I_REMEMBER_DATA_DIR`: SQLite and uploads directory.
- `I_REMEMBER_DEFAULT_LANGUAGE`: `en`, `fr`, or `zh`.
- `I_REMEMBER_ANONYMOUS_SUBMISSIONS`: `true` or `false`.
- `I_REMEMBER_AUTO_APPROVE_SUBMISSIONS`: keep `false` unless the site is private.
- `I_REMEMBER_SEED_ARCHIVE_DATA`: set `true` only when you want to import the
  restored public archive into a fresh database.
- `I_REMEMBER_SEED_STARTER_CONTENT`: set `true` only when you want starter
  pages and footer menu items in a fresh database.
- `UMAMI_SRC` and `UMAMI_WEBSITE_ID` for self-hosted Umami tracking.

## Repository Hygiene

Generated or runtime material is intentionally excluded from Git:

- `qa/`
- `data/`
- `db/`
- `.revival-data/`
- `.revival-storage/`
- SQLite files
- `dist/`

SQL migration source lives in `src/server/migrations/sqlite/`.

## Release

- `package.json` is the source of truth for the app version.
- `CHANGELOG.md` records user-facing changes.
- `.github/workflows/docker.yml` publishes `zerostwo/i-remember.fr:<version>`,
  `zerostwo/i-remember.fr:latest`, and `zerostwo/i-remember.fr:sha-<commit>` on
  pushes to `main`.
- Pushing a `vX.Y.Z` tag also publishes `X.Y.Z`, `X.Y`, and `latest`.

## License Position

I did not find an open-source license for the original `i-remember.fr` site in
public search results. The restored original terms included with this project
state that the site structure, software, text, images, video, sound, know-how,
animations, information, and content are owned by the Fondation pour la
Recherche Medicale or used under rights.

Because this repository contains restored original frontend code and assets, the
repository should not be published as MIT, Apache, GPL, or another open-source
license as a whole unless the original rights are cleared.

The practical recommendation for this derivative repository is:

- Keep the repository as source-available with explicit copyright and license
  boundaries.
- Treat restored original frontend code, brand, text, media, fonts, audio, and
  visual assets as excluded third-party material.
- If desired later, split the new backend/admin implementation into a separate
  clean package and license only that package under MIT or Apache-2.0.

See `LICENSE` for the current repository-level notice.
