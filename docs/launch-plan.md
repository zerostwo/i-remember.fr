# songqi.org launch plan

Status: design and code audit completed on 2026-07-27. Production cutover is
not yet approved.

## Product contract

- This is Songqi Duan's single-owner personal blog, not a multi-tenant product.
- Anonymous visitors can create a New Memory without signing in.
- New anonymous and owner-created memories publish immediately unless the owner
  explicitly chooses another status.
- Preserve the memory-galaxy, search, submission, and opened-memory task flow,
  but implement the public experience as a clean-room `songqi.org` design.
- Do not reuse the restored site's brand, legal text, user content, fonts,
  audio, sprite, tracking identifiers, source bundle, or pixel trade dress.
- Ship one production image.

## Current launch verdict

The API, PostgreSQL/Prisma database package, storage package, one-image
container, health checks, and backup/restore scripts are useful foundations.
The project is not safe to publish as `songqi.org` yet because the public bundle
still contains restored third-party code, assets, identity, legal claims, and
200 embedded memories. The admin also exposes several misleading or incomplete
capabilities.

The fastest safe path is not a cosmetic rename. It is a clean-room public shell,
then the approved admin V2, followed by bounded repository consolidation and a
controlled domain cutover.

## Phase 1 — Remove launch blockers and establish the clean-room public shell

### Work

1. Remove the embedded `DEFAULT_POSTS` from `index.html` and `fr.html`.
2. Remove the `/index.html` static bypass so every public route uses the same
   current-data rendering path.
3. Delete old ignored uploads and keep runtime uploads exclusively in the
   configured storage volume. Exclude them from Docker and Vite build contexts.
4. Replace the restored public bundle with a new `apps/web` application that
   directly uses the v1 API.
5. Reimplement the memory galaxy, public search, anonymous New Memory flow,
   image handling, and memory card using new code and newly licensed assets.
6. Replace the restored identity, credits, donation copy, social IDs, analytics,
   fonts, audio, sprite, and tracking with `songqi.org` identity and optional
   self-hosted Umami.
7. Create accurate `/terms` and `/privacy` pages for the personal operator. The
   privacy text must state whether email is transient or stored, what public
   fields are published, how removal requests work, and how backups are kept.
8. Add a build-time forbidden-content scan so restored names, post IDs, legal
   claims, tracking IDs, and legacy assets cannot re-enter `dist`.

### Exit criteria

- An empty database renders a real empty state with no phantom particles.
- Only current published memories are searchable and map-interactive.
- Anonymous New Memory works end to end and publishes immediately.
- No restored user content, operator identity, legal text, tracking ID, font,
  audio, sprite, or original runtime bundle exists in the production image.
- `/`, `/zh`, `/memory/:id`, language switching, `/terms`, and `/privacy` pass
  desktop and mobile browser checks.

## Phase 2 — Implement the approved admin V2 and repair functional truth

Figma source:
<https://www.figma.com/design/cFsmOQaPKot04xwNci0vyt>

Use the page `Admin Refresh — V2 / songqi.org`; the V1 page is superseded.

### Information architecture

```text
Search                    Command-K / Control-K overlay

Dashboard                 /admin
Content
  Memories                /admin/memory
  Pages                   /admin/pages
  Attachments             /admin/attachments
  Navigation              /admin/menus
System
  Settings                /admin/settings?tab=site
```

Settings tabs:

```text
/admin/settings?tab=site
/admin/settings?tab=account
/admin/settings?tab=security
/admin/settings?tab=backup
```

Do not show Comments until public comments work end to end. Do not show Theme
until there are real editable theme settings.

### Work

1. Put the current page title and description in the top bar and its primary
   action at the right edge. Dashboard uses `New memory`.
2. Replace the fixed top-bar filter with a sidebar Search action and centered,
   keyboard-navigable command palette. Support Command-K, Control-K, Escape,
   focus return, and reduced motion.
3. Implement 240 px expanded and 72 px collapsed sidebars with Lucide icons,
   tooltips, active state, persistence, and a complete mobile navigation sheet.
4. Move Backup into Settings. Rename the current browser JSON action to
   `Export content`; clearly distinguish it from the server-side PostgreSQL,
   uploads, secrets, manifest, and checksum backup.
5. Remove inert Runtime behavior, Security boundary, Theme, auto-approval, and
   other controls that cannot be changed.
6. Keep 2FA identity confirmation isolated in the Security tab.
7. Fix route parsing, browser history, memory editor deep links, unknown admin
   routes, and development/production route parity.
8. Make global admin search cover Actions, Memories, Pages, and Navigation.
9. Fix default-language bootstrap requests for Pages and Navigation.
10. Add a strict Settings API allowlist and structured validation.
11. Remove the attachment list's hidden 80-item truncation.

### Exit criteria

- Every visible control changes real state, navigates somewhere real, or is
  explicitly labeled read-only.
- Keyboard, focus, reduced-motion, narrow desktop, and mobile navigation checks
  pass.
- Site, Account, Security, and Backup tabs preserve browser history and direct
  links.
- Owner setup, login, recovery code, 2FA, Memory CRUD, Page CRUD, attachments,
  Navigation, anonymous submissions, Umami, and content export pass end to end.

## Phase 3 — Complete the workspace boundaries without delaying launch

The monorepo shape is reasonable, but the Web and Admin migration is incomplete.
`apps/api`, database, storage, types, and memory-engine already have meaningful
ownership; `apps/web`, `apps/admin`, and `packages/ui` do not.

### Work

1. Move the real public entry, source, and Vite config into `apps/web`.
2. Move the real admin entry and source into `apps/admin`.
3. Split the current 2,239-line `AdminApp.jsx` by route and feature:

   ```text
   apps/admin/src/
     app/
     routes/
     features/
       dashboard/
       memories/
       pages/
       attachments/
       navigation/
       settings/
       command-menu/
     lib/api/
   ```

4. Make `packages/ui` own its components instead of re-exporting root source.
5. Merge only genuinely shared route/domain contracts; remove the unused
   `packages/config` facade if nothing consumes it.
6. Remove unreferenced split-image Dockerfiles, duplicate admin HTML, duplicate
   API check wrapper, unused dashboard adapters, stale generated output, and
   stale architecture documentation.
7. Keep the root `Dockerfile` and one production image.

### Exit criteria

- Each workspace builds and tests its own source rather than a root-level proxy.
- No production package imports application source from outside its boundary.
- `turbo run build`, type checks, tests, database migration checks, and the
  single-image CI smoke test pass from a clean checkout.
- The architecture and deployment documents match the actual Compose and CI
  topology.

## Phase 4 — Production rehearsal and songqi.org cutover

### Work

1. Confirm whether this app replaces the existing apex `songqi.org` site or
   launches on a subdomain. Do not change DNS before that decision is explicit.
2. Rehearse the exact production image on a staging origin with production-like
   PostgreSQL, storage, proxy headers, TLS, and secrets.
3. Start from a fresh database, run migrations, create the owner account, set
   the canonical URL, language, timezone, anonymous-submission policy, and
   optional Umami settings.
4. Create a full server backup and perform one restore rehearsal into an empty
   isolated volume.
5. Validate health checks, graceful restart, uploads, content export, public
   submission, memory publishing, language routes, canonical links, robots,
   sitemap, CSP, cookies, rate limits, and recovery codes.
6. Cut DNS and reverse proxy only after the smoke suite passes. Keep the prior
   site and image available for rollback until the observation window closes.

### Exit criteria

- Production URL, TLS, canonical links, health checks, and monitoring are green.
- The published image digest and migration version are recorded.
- A restore rehearsal is documented and the rollback target is known.
- No Mock data or restored third-party data is present.

## Go/no-go blockers

The following block public launch:

- Any restored user content, source bundle, asset, legal identity, or tracking
  identifier remains in the production image.
- Anonymous New Memory, privacy/terms acceptance, or immediate publishing is
  not verified end to end.
- The target for the currently occupied `songqi.org` apex is not confirmed.
- No verified full backup and restore rehearsal exists.

The full source-tree cleanup is important, but it does not need to block a safe
beta once Phases 1 and 2 are complete and the single-image verification remains
green.
