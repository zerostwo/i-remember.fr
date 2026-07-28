# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Current backend/product decisions:

- Preserve the archive's core memory-galaxy and anonymous submission interaction
  model, but do not preserve the original site's brand skin or protected
  materials. The owner has no written authorization for the original site, so
  public-facing code, copy, identity, legal text, logos, media, and visual assets
  must be replaced with a clean-room `songqi.org` personal-blog treatment.
- For the production architecture refactor requested on 2026-07-08, keep the
  one-image pnpm/turbo, TypeScript API, PostgreSQL/Prisma, and verification
  requirements. Its old exact-visual-preservation constraint is superseded only
  where the current clean-room debranding decision requires replacement.
- Use the admin-configured default language for `/`, missing `ln`, and bare `/memory/:id` routes; the initial default is English.
- Preserve French support and add full Chinese support at `/zh`; public memory
  pages remain on `/memory/:id` and use `ln` only for display language.
- Because the project is still early, do not preserve previous legacy compatibility; remove compatibility fallbacks as production PostgreSQL/Prisma paths become available.
- Expose first-pass AI agent support through HTTP APIs, not MCP.
- Keep Facebook and Instagram API modernization out of scope until explicitly requested.
- Publish one Docker image only; do not split publishing into separate `web`, `admin`, and `api` images. DockerHub image name and tag must still come from `DOCKERHUB_IMAGE` and `TAG`.
- For the admin experience, create and confirm Figma UI designs first; only build the clickable responsive backend prototype after the UI is approved.
- Use the approved Figma V2 file
  `cFsmOQaPKot04xwNci0vyt` (`i-remember.fr Admin Refresh 2026-07-26`,
  starting at node `18:60`) as the admin implementation source of truth.
- Keep the admin experience concise, elegant, calm, and low-noise. Simplify
  navigation labels, route structure, information hierarchy, form density, and
  table presentation; avoid generic dashboard ornament. Treat the public
  clean-room redesign as a separate implementation stage from the admin
  redesign.
- Treat the admin as the private control surface for a single-owner personal blog
  at `songqi.org`, not as a generic multi-tenant SaaS dashboard.
- On desktop, use a page-aware top bar: the current page title and its short
  description occupy the left side, and the page's primary action occupies the
  right side. On Dashboard this means `Dashboard` plus its supporting text on
  the left and `New Memory` on the right; do not reserve that space for a
  persistent search input.
- Put global admin search in the sidebar and expose it as a centered Spotlight-
  style command palette with `Command-K` / `Control-K`. Search is an overlay,
  not a standalone route. It should be immediately interruptible, keyboard
  navigable, dismissible with Escape, and honor reduced-motion preferences.
- Give every sidebar destination a clear Lucide icon and support a compact,
  icon-only collapsed state with tooltips. Preserve the active destination and
  user-controlled collapsed state across navigation.
- The future admin should cover common personal-blog management modules while preserving anonymous public memory submission, and should include first-class support for self-hosted Umami tracking.
- The launch admin information architecture is: login, dashboard, content
  management with Memory/Page/Attachment/Navigation sections, and one Settings
  destination. Settings contains Site, Account, Security, and Backup tabs;
  Backup is not a standalone sidebar route. Hide Comment until public comments
  work end to end, and hide Theme until it has real editable settings. Label the
  existing Menu capability as Navigation in the UI. Blog posts are folded into
  Memory; long-form Memory entries use a Read more affordance instead of a
  separate Posts module.
- The admin Menu section manages the public home page's original lower-right footer navigation, not the admin sidebar. Menu items can target editable pages, memories, searches, or external URLs.
- Editable menu pages and Memory content use Markdown. Published pages are mirrored into long-form Memory entries so footer clicks can use the same search-like discovery and Read more card behavior as normal memories.
- After UI direction is accepted, admin prototypes should be wired to real backend data and tested end to end before being treated as deliverable.
- The public intro/loading screen should support click/tap fast-forward so repeat visits can quickly see both intro message groups and enter the app.
- Public language switching should stay on the current route path: switching updates `ln` language text only for display, and route path (including `/memory/:id`) is preserved.
- Public and admin language controls are UI language only; they must not choose content collections, menu records, or admin list data. Backend/admin content uses the site default language from System Settings.
- Public memory URLs must be language-free `/memory/:id` routes using non-sequential random alphanumeric public IDs; legacy numeric memory URLs must not resolve memory content.
- Each memory may occupy only one map coordinate; deduplicate memory identity before passing posts into the legacy map/search rendering flow.
- Anonymous and admin-created memories publish immediately by default; do not require moderation unless an admin explicitly sets a non-published status.
- Anonymous `New Memory` creation remains a first-class public workflow for
  `songqi.org` and should preserve the current archive sequence and immediate-
  publish behavior, including its existing name/email/terms interaction, while
  replacing the original operator identity and legal/privacy copy.
- Public memory particles/search results must come only from real current memories. Empty memory datasets must not fall back to bundled legacy sample posts or interactive phantom points.
- Preserve the public search, add-memory, exploration, and opened-memory task
  sequence and reachability, but do not treat the original site's pixel
  positions, dimensions, trade dress, or assets as a contract. The new
  clean-room `songqi.org` design is the visual source of truth.
- Treat a memory as map-interactive only when it has a real identity and non-empty content and is currently public and published; never create or render Untitled placeholder memories.
- Compute the public fade percentage from recent real published-memory activity rather than keeping the archive's static 13% value.
- Keep `/admin/memory` as a list-only route and use `/admin/memory/editor?id=<public-id>` for editing; determine long-form behavior automatically from content exceeding the public card preview length.
- Footer Menu owns all public lower-right items, including built-ins; it supports one configurable `GROUP` level whose children can target pages, memories, searches, or external URLs, but children cannot contain another group.
- Settings uses separate Site, Account, Security, and Backup tabs; 2FA identity
  confirmation belongs to Security and must not reuse hidden state from the
  Account form.
- Settings may contain only controls that can actually be changed and saved.
  Environment/runtime facts such as process boundaries, trust-proxy state, or
  security-boundary descriptions belong in deployment documentation or a
  clearly read-only status surface, not among editable settings. Do not show
  inert `Runtime behavior` or `Security boundary` setting cards.
- Do not commit generated QA artifacts, imported data snapshots, runtime database directories, SQLite files, or `db/`; SQLite runtime and migration paths are removed and must not be reintroduced.
- After modifying this repository, create a clean ccc-style Conventional Commit before handing work back.
