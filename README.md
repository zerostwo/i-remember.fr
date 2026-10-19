# Songqi — a home for memories

[![Docker build and verification](https://github.com/zerostwo/i-remember.fr/actions/workflows/docker.yml/badge.svg)](https://github.com/zerostwo/i-remember.fr/actions/workflows/docker.yml)
[![Docker Hub](https://img.shields.io/badge/Docker_Hub-zerostwo%2Fi--remember.fr-2496ED?logo=docker&logoColor=white)](https://hub.docker.com/r/zerostwo/i-remember.fr)

A self-hosted personal website and shared memory archive: explore a three-dimensional
memory galaxy, keep photographs, videos, audio, and stories, and invite visitors to leave a memory.
Built for **Songqi Duan / 段松岐** and the intended personal domain **[songqi.org](https://songqi.org)**.
Other self-hosters can set their own public name, description, and domain in the admin.

一个用来珍藏生活片段的个人主页：在三维记忆星海中探索照片与故事，也让来访者留下值得记住的瞬间。
支持 Docker Compose 自托管，以及可在后台修改的站点与搜索引擎信息。

![Interactive memory galaxy with the original orbit, search, and add-memory controls](docs/images/galaxy.webp)

## What you can do

- **Explore memories in 3D.** Drag, orbit, zoom, search, and open individual memories;
  the original galaxy, transitions, typography, and ambient audio are preserved.
- **Keep short moments and longer stories.** Write Markdown, attach photos and videos,
  organize tags, and open longer entries with **Read more** directly after the
  excerpt. Long memories and managed pages share the same restrained reading overlay.
- **Keep a photo collection together.** Add up to 6 photos/videos/audio files per memory, adjust each
  square preview with drag and zoom inside the circular composition guide, and
  drag thumbnails to reorder them (or use Alt + arrow keys). Thumbnails are
  centered in rows of six. Click a memory photo to view the complete original;
  GIF animation is preserved throughout the gallery.
- **Keep cards uncluttered.** Photo arrows appear on hover or keyboard focus, with
  small dots for album navigation. Publication dates and saved locations are not
  displayed on public cards. Sharing is off by default and can
  be enabled in **Settings → Site → Show sharing buttons**.
- **Discover another moment.** Swipe vertically on an opened photo or choose
  either circular side arrow to visit a random memory with a short transition. Horizontal
  swipes browse its photos. Admin **Memories** shows sortable view totals;
  opening a memory counts once, while prefetching and changing photos do not.
- **Invite contributions.** Optional anonymous submissions follow a staged
  media/text/name/email/terms flow and publish immediately when enabled.
- **Manage a personal site.** Dashboard, Memories, Pages, Attachments, and Navigation;
  Site, Account, Security, and Backup settings; keyboard search with ⌘K / Ctrl-K.
- **Own the data.** PostgreSQL/Prisma, local upload storage, two-factor authentication,
  full backup/restore tooling, and optional self-hosted Umami analytics.
- **Make content discoverable.** Server-rendered metadata, canonical URLs, structured
  data, `robots.txt`, and a sitemap of real published public memories.
- **Use your language.** English by default, with French and Chinese support. UI
  language does not select a different content collection.

The public archive retains the restored `i-remember.fr` visual experience; the
current product is a personal keepsake, not an Alzheimer's campaign. The repository
and Docker image retain their existing names. See [License](#license).

## A look inside

The private dashboard gives the owner a compact view of content and publishing.

![Owner dashboard with recent memories and publishing controls](docs/images/admin.webp)

Search identity is editable in **Settings → Site**, alongside language and submission defaults.

![Site settings for canonical domain, search description, owner name, and alternate name](docs/images/settings.webp)

The galaxy and admin screenshots were captured on 2026-09-14 with a disposable
PostgreSQL database and authored demo memories. Demo data is not bundled into a fresh
installation. The upload screenshot was captured locally on 2026-10-18 using a
synthetic file. [Screenshot notes](docs/images/README.md).

## Audio memories

Public and admin uploads accept MP3, M4A, WAV, OGG and FLAC (100 MB / 10 minutes
per file). Audio shares the six-item public gallery limit with photos and videos.
Chunked transfers and asynchronous FFmpeg conversion report real upload and
processing progress. Files are validated by their decoded streams, converted to
192 kbps MP3, and stored with a generated monochrome particle-ring cover. Source
files and embedded metadata are discarded after conversion. No database migration
is required; audio uses the existing attachment records.

Open an audio cover to listen. A silver-white particle ring responds to the actual
frequency spectrum, with pause, seeking and volume controls. Playback temporarily
mutes the galaxy soundtrack and restores it on pause or close. Reduced-motion
preferences use a static ring; background tabs stop visualization rendering.
The Web Audio analyser requires no microphone access. The shared upload session
protocol is also available at `/api/audio-uploads`; audio streaming supports Range
requests at its returned attachment URL. Run `node scripts/check-audio.mjs` to check
validation, conversion, cover generation and temporary-file cleanup.

## Photos, videos, and upload progress

Public submissions and the admin memory editor accept MP4, MOV and WebM alongside
JPEG, PNG, WebP and GIF. New public memories can contain up to six photos/videos/audio files
combined; existing larger albums remain readable. Videos are limited to 500 MB,
ten minutes and 4K input. The server generates a poster for the circular composition
step and square memory card, then converts video to H.264/AAC MP4 (up to 1920 pixels
on either side, 30 fps). Opening the card plays the complete frame with thin-line,
auto-hiding controls for playback, seeking, sound and full screen. Keyboard users
can tab through the controls; Space/K toggles playback and left/right seeks five
seconds when the player itself is focused. Changing media or closing stops playback.
Photo arrows are unframed, and gallery dots and arrows adapt to local image brightness.
Images that cannot be sampled retain white controls with contrasting shadows.
Gallery navigation does not count as another memory view. Source video is discarded after conversion.

The single Docker image includes FFmpeg/ffprobe. Local development needs both on
PATH. Run `node scripts/check-video.mjs` for decoder/limit/cleanup regression checks.
One video is processed at a time per web process; additional concurrent attempts
receive a retry message. Public and admin video uploads use 8 MB parts and poll
for conversion completion, so the 500 MB total does not require a single large
Cloudflare request or a long-lived HTTP response. Upload sessions expire after
30 minutes of inactivity; a server restart requires choosing the video again.
The direct `/api/upload-video` API still requires 501 MB request bodies and a
960-second upstream read timeout when used without the part-based workflow. Keep the upload
volume backed up with PostgreSQL; video files and generated posters live together.

Photo uploads default to 8 MB and 64 megapixels. Video size and duration limits
are editable in Site settings, with defaults of 500 MB and 10 minutes.

Upload progress illuminates the existing particle circle clockwise, with a
percentage and a short status inside it. File transfer uses actual bytes sent;
video conversion reports FFmpeg progress separately. Preparing and finishing
stages show an activity state until measurable progress is available. Additional
files return to the same composition flow after uploading. The admin editor
also shows attachment progress.

![Upload progress following the existing particle circle](docs/images/upload-progress.webp)

## Deploy with Docker Compose

The production runtime is **one application image and one persistent volume**.
The image runs the web server, private TypeScript API, and PostgreSQL 15 together;
no separate database container is required. Docker Engine and the Compose plugin
are prerequisites. Published CI images currently target Linux amd64.

```bash
git clone https://github.com/zerostwo/i-remember.fr.git
cd i-remember.fr
cp .env.example .env
```

Edit `.env` before starting. Select a successfully published immutable tag from
[GitHub Actions](https://github.com/zerostwo/i-remember.fr/actions/workflows/docker.yml)
or [Docker Hub tags](https://hub.docker.com/r/zerostwo/i-remember.fr/tags):

```dotenv
DOCKERHUB_IMAGE=zerostwo/i-remember.fr
TAG=sha-REPLACE_WITH_12_CHARACTER_COMMIT
I_REMEMBER_HOST_PORT=7892
I_REMEMBER_SITE_NAME="I remember,"
I_REMEMBER_SITE_TITLE="Songqi Duan | 段松岐"
I_REMEMBER_CANONICAL_URL=https://songqi.org
I_REMEMBER_OWNER_NAME="Songqi Duan"
I_REMEMBER_OWNER_ALTERNATE_NAME="段松岐"
I_REMEMBER_SITE_DESCRIPTION="A quiet place for the moments we might one day forget."
I_REMEMBER_DEFAULT_LANGUAGE=en
I_REMEMBER_ANONYMOUS_SUBMISSIONS=false
```

The example `TAG` is a placeholder, not a published image. `latest` is also published,
but an immutable `sha-*` tag with a recorded digest makes rollbacks reproducible.
Leave `AUTH_SECRET` empty for a fresh instance; the container generates and persists it.

```bash
docker compose config --quiet
docker compose pull app
docker compose up -d --no-build app
docker compose ps
curl --fail http://127.0.0.1:7892/readyz
```

Open [the local site](http://127.0.0.1:7892) and complete `/admin/setup` **before
allowing public traffic**. Setup creates the single owner and closes after that
account exists. Then use `/admin/` to manage the site. Anonymous submissions are
disabled initially; enable them in Site settings when ready.

The Compose volume `app-data` stores database files, uploads, the generated auth
secret, and logs. Preserve this volume when updating. Do not run `docker compose
down -v` on data you want to keep.

For HTTPS, point your domain's DNS to your host and place a reverse proxy or tunnel
in front of `127.0.0.1:7892`. Keep the application port private. See the
[deployment guide](docs/deployment.md) for proxy trust, health checks, backups,
restores, and database upgrades. Publishing a Docker image does not deploy a live
website or configure DNS.

## Search engines and your own identity

In **Settings → Site**, save:

| Setting          | What it controls                                                        |
| ---------------- | ----------------------------------------------------------------------- |
| Site name        | Preferred name above the URL in search results                          |
| Homepage title   | Browser title and homepage search title                                 |
| Canonical URL    | Your public HTTP(S) origin, e.g. `https://songqi.org`; no path or query |
| Site description | Homepage search snippet and sharing description                         |
| Owner name       | Public name, e.g. `Songqi Duan`                                         |
| Alternate name   | Another spelling or language, e.g. `段松岐`; may be blank               |

These settings are stored in PostgreSQL and included in backups. Environment values
initialize missing settings; once saved, edit them in the admin. Existing instances
receive defaults for the new fields on upgrade: review these before public launch,
especially when hosting under a different identity. Public metadata refreshes within
about five seconds. SEO settings do not reskin the restored frontend or admin branding. The homepage
uses the site title exactly as saved, without appending the owner names; owner
identity remains in the structured data. For songqi.org, use `Songqi Duan | 段松岐`
and `A quiet place for the moments we might one day forget.` Existing instances
must save these values in Settings → Site; updated environment defaults do not
replace settings already stored in PostgreSQL.

New memories receive eight-character random IDs. In the memory editor, **Public
ID** can be customized (4–32 letters, digits or hyphens; start with a letter).
Changing it keeps earlier links working through redirects and preserves the
memory's photos, map position and view count. Existing long links remain valid.

Public `/memory/<random-id>` pages have their own title, description, canonical URL,
sharing image, and structured content. Display-language variants canonicalize to the
same content URL. JavaScript-free visitors receive readable text and memory links;
homepage memory excerpts are excluded from search snippets, while detail pages
and discovery links remain indexable. The interactive galaxy remains the normal experience. Admin/API responses carry
`noindex`; sitemap generation uses only the public API, excluding private, unlisted,
draft, archived, and empty entries.

After deploying your own domain:

1. Verify that HTTPS serves your application, not a parked domain or login challenge.
2. Check `/robots.txt`, `/sitemap.xml`, and the HTML source of `/` and a published memory.
3. Verify your domain in [Google Search Console](https://search.google.com/search-console/about)
   and [Bing Webmaster Tools](https://www.bing.com/webmasters/about), then submit `/sitemap.xml`.
4. Publish an introduction using your real public name and link to the site from your
   public profiles. Use descriptive memory titles and original content.

This helps search engines discover and understand the website; **indexing, ranking,
and appearing for a particular name are not guaranteed or immediate**. See the
[SEO guide](docs/seo.md) for deployment checks and official references.

## Local development

Use Node.js 22 (CI: 22.23.1), pnpm 10.17.1, and a running PostgreSQL database. Native
local development requires its own database; embedded PostgreSQL is a Docker feature.
Install FFmpeg and ffprobe on PATH to upload or test videos.

```bash
corepack enable
pnpm install --frozen-lockfile
export DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/songqi_dev'
export AUTH_SECRET='replace-with-a-long-random-local-secret'
export API_TRUST_PROXY=true
pnpm db:migrate
pnpm dev
```

`API_TRUST_PROXY=true` here assumes the private loopback API is reached only through
the supplied web proxy. Open the Vite URL printed in the terminal; admin is under
`/admin/`. Shell exports, not the deployment `.env` file, configure these processes.

For a production-style local run:

```bash
pnpm build
pnpm --filter @i-remember/api start
# In another terminal with the same environment:
pnpm start
```

The web server defaults to `127.0.0.1:7890`, with the private API at
`127.0.0.1:7892`. `/readyz` reports database/API readiness; `/version` reports the build.

## Code and verification

| Location                                     | Responsibility                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| `apps/api`                                   | Versioned HTTP API, authentication, services, validation, PostgreSQL repositories |
| `apps/admin`                                 | React owner interface                                                             |
| `apps/web`, `public`, `src/server`           | Public galaxy, runtime integration, server HTML and SEO                           |
| `packages/database`                          | Prisma schema, migrations, and client                                             |
| `packages/content`, `packages/memory-engine` | Markdown rendering and memory normalization                                       |
| `packages/storage`                           | Local and S3-compatible storage adapters                                          |
| `docker`                                     | Single-image lifecycle, health checks, backup/restore, container smoke tests      |

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm test:video
pnpm audit --prod --audit-level=high
```

For data-dependent regression checks, set `I_REMEMBER_TEST_DATABASE_URL` to a migrated,
disposable PostgreSQL database whose name contains `test` or `review`, then run
`pnpm test:postgres`. Runtime databases, uploads, generated builds, and disposable QA
artifacts are excluded from Git. Curated README screenshots live in `docs/images`.

Builds use one root `Dockerfile`. Turbo builds the database before the API and
runs package checks; Vite produces the public/admin assets once. `pnpm test`
combines package tests with `test:integration`. Admin UI primitives and their
state variants are checked in; the shadcn generator CLI is not a build dependency.
See the [maintenance audit](docs/maintenance-2026-10-18.md) for the cleanup scope.

The [Docker workflow](.github/workflows/docker.yml) verifies source, dependency
advisories, and container fresh-start/restart/backup/restore behavior before publishing.
Pushes to `main` publish `sha-<12-character-commit>` and `latest`. A matching `vX.Y.Z`
release tag also publishes `X.Y.Z`. All tags refer to the same single-image runtime.

See [CHANGELOG](CHANGELOG.md), [API documentation](apps/api/README.md),
[deployment](docs/deployment.md), and [SEO](docs/seo.md).

## License

This is a source-available restoration with third-party frontend code and assets.
The repository as a whole is **not offered under MIT, Apache, or GPL**. Restored
visuals, fonts, audio, and other third-party materials retain their existing rights
and are not relicensed by this README. See [LICENSE](LICENSE) for the repository notice.
