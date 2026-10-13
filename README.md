# Songqi — a home for memories

[![Docker build and verification](https://github.com/zerostwo/i-remember.fr/actions/workflows/docker.yml/badge.svg)](https://github.com/zerostwo/i-remember.fr/actions/workflows/docker.yml)
[![Docker Hub](https://img.shields.io/badge/Docker_Hub-zerostwo%2Fi--remember.fr-2496ED?logo=docker&logoColor=white)](https://hub.docker.com/r/zerostwo/i-remember.fr)

A self-hosted personal website and shared memory archive: explore a three-dimensional
memory galaxy, keep photographs and stories, and invite visitors to leave a memory.
Built for **Songqi Duan / 段松岐** and the intended personal domain **[songqi.org](https://songqi.org)**.
Other self-hosters can set their own public name, description, and domain in the admin.

一个用来珍藏生活片段的个人主页：在三维记忆星海中探索照片与故事，也让来访者留下值得记住的瞬间。
支持 Docker Compose 自托管，以及可在后台修改的站点与搜索引擎信息。

![Interactive memory galaxy with the original orbit, search, and add-memory controls](docs/images/galaxy.webp)

## What you can do

- **Explore memories in 3D.** Drag, orbit, zoom, search, and open individual memories;
  the original galaxy, transitions, typography, and ambient audio are preserved.
- **Keep short moments and longer stories.** Write Markdown, attach photographs,
  organize tags, and open longer entries with **Read more**.
- **Keep a photo collection together.** Add up to 10 photos per memory, adjust each
  square preview with drag and zoom, and click to view the complete photos. Use the
  arrows or swipe to browse; uploaded originals are preserved.
- **Discover another moment.** Swipe vertically on an opened photo or choose
  **Another memory** to visit a random memory with a short transition. Horizontal
  swipes browse its photos. Admin **Memories** shows sortable view totals;
  opening a memory counts once, while prefetching and changing photos do not.
- **Invite contributions.** Optional anonymous submissions follow a staged
  photo/text/name/email/terms flow and publish immediately when enabled.
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

Screenshots were captured from the running application on 2026-09-14 with a disposable
PostgreSQL database and authored demo memories. Demo data is not bundled into a fresh
installation. [Screenshot notes](docs/images/README.md).

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
I_REMEMBER_SITE_TITLE=Songqi
I_REMEMBER_CANONICAL_URL=https://songqi.org
I_REMEMBER_OWNER_NAME="Songqi Duan"
I_REMEMBER_OWNER_ALTERNATE_NAME="段松岐"
I_REMEMBER_SITE_DESCRIPTION="Songqi Duan (段松岐): a personal home for memories, photographs, and beautiful moments worth keeping."
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
| Site title       | Browser titles, site name, and sharing metadata                         |
| Canonical URL    | Your public HTTP(S) origin, e.g. `https://songqi.org`; no path or query |
| Site description | Homepage search snippet and sharing description                         |
| Owner name       | Public name, e.g. `Songqi Duan`                                         |
| Alternate name   | Another spelling or language, e.g. `段松岐`; may be blank               |

These settings are stored in PostgreSQL and included in backups. Environment values
initialize missing settings; once saved, edit them in the admin. Existing instances
receive defaults for the new fields on upgrade: review these before public launch,
especially when hosting under a different identity. Public metadata refreshes within
about five seconds. SEO settings do not reskin the restored frontend or admin branding.

Public `/memory/<random-id>` pages have their own title, description, canonical URL,
sharing image, and structured content. Display-language variants canonicalize to the
same content URL. JavaScript-free visitors receive readable text and memory links;
the interactive galaxy remains the normal experience. Admin/API responses carry
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
pnpm audit --prod --audit-level=high
```

For data-dependent regression checks, set `I_REMEMBER_TEST_DATABASE_URL` to a migrated,
disposable PostgreSQL database whose name contains `test` or `review`, then run
`pnpm test:postgres`. Runtime databases, uploads, generated builds, and disposable QA
artifacts are excluded from Git. Curated README screenshots live in `docs/images`.

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
