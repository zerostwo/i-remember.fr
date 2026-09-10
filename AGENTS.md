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
- Never cycle a short memory list to populate extra star positions. Preserve each
  memory's grid ownership while exploring, searching, and returning to the map;
  recycled particle meshes must not create duplicate or stale clickable memories.
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
- First-owner setup does not use an installation or bootstrap token. Keep it
  reachable only while the user table is empty, retain global setup rate
  limiting, and complete owner creation before exposing a fresh instance to
  untrusted traffic. Admin passwords must accept values of at least eight
  characters, including `981211@Dd`.
- Do not commit generated QA artifacts, imported data snapshots, runtime database directories, SQLite files, or `db/`; SQLite runtime and migration paths are removed and must not be reintroduced.
- After modifying this repository, create a clean ccc-style Conventional Commit before handing work back.
- On 2026-09-07, the owner approved completing the public clean-room redesign
  directly in the established concise dark `songqi.org` direction because the
  Product Design `get-context` skill/tool is unavailable. This approval waives
  that prerequisite for the current audit-fix task. Preserve the galaxy,
  search, anonymous photo/name/email/terms submission sequence, immediate
  publication, and long-form reading; replace the restored public code/assets.
- On 2026-09-06, the owner clarified that the original full-screen three-dimensional
  memory galaxy visual effect and public interaction model must be preserved.
  Do not replace it with a flat constellation, split hero, or a card-list homepage.
  Keep orbit/drag/zoom, memory selection, overlay search, and the staged submission
  flow. Clean-room identity changes and defect fixes must work within that experience.

- Latest owner instruction on 2026-09-06 supersedes the public clean-room redesign
  and earlier redesign waivers: preserve the original public visual style one to
  one, including its typography, layout, three-dimensional galaxy, transitions,
  interactions, original background music and sound effects. Modernize internal
  code and improve efficiency without changing the desktop appearance. Fix mobile
  compatibility with responsive adaptations. Do not substitute a newly drawn
  galaxy or redesign the homepage. Existing admin direction remains unchanged.
- During the current repair and review, use English for all public and admin UI
  previews and verification. Keep English as the site default; retain other
  language support for later use, without presenting the Chinese UI for now.
- Owner feedback on 2026-09-06: keep the original mobile globe, search, and add
  controls on one visual center line, with hit targets aligned to the rendered
  graphics. Align footer labels and the sound icon while preserving the original
  visual assets. Default-language public URLs must be clean (`/` and
  `/memory/:id`), without a redundant `?ln=en`; retain non-default language support.
- Owner feedback on 2026-09-06: remove rectangular white focus outlines from
  public search and staged memory-entry fields; preserve their original caret
  and focus treatment. Fit the complete desktop memory card and close control
  between the header/footer without changing the original typography. Remove
  the public Language switcher, while retaining translation and language-route
  support. Keep the approved admin style and ensure its pages are consistent.
- Owner feedback on 2026-09-10: position `songqi.org` as a personal and shared
  memory keepsake, not an Alzheimer's campaign. Public intro, persistent header,
  metadata/share copy, and post-submission thanks should invite the owner and
  visitors to preserve beautiful moments they may otherwise forget, while
  retaining the original visual style and memory-galaxy interaction.
- Owner feedback on 2026-09-10: on portrait mobile only, place the globe, search,
  and add controls as a horizontal row inside the lower black footer region.
  Keep their rendered graphics aligned with their hit targets and preserve the
  desktop vertical placement.
