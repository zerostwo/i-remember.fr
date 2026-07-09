# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Current backend/product decisions:

- Keep the restored archive UI visually unchanged while modernizing the backend.
- For the production architecture refactor requested on 2026-07-08, the pasted refactor document is the highest-priority product/engineering source except for Docker publishing: keep one production image. Implement the pnpm/turbo monorepo, TypeScript API app, PostgreSQL/Prisma database package, and full verification plan while keeping the archive frontend experience visually unchanged.
- Use the admin-configured default language for `/`, missing `ln`, and bare `/memory/:id` routes; the initial default is English.
- Preserve French support and add full Chinese support at `/zh` and `/zh/memory/:id`.
- Because the project is still early, do not preserve previous legacy compatibility; remove compatibility fallbacks as production PostgreSQL/Prisma paths become available.
- Expose first-pass AI agent support through HTTP APIs, not MCP.
- Keep Facebook and Instagram API modernization out of scope until explicitly requested.
- Publish one Docker image only; do not split publishing into separate `web`, `admin`, and `api` images. DockerHub image name and tag must still come from `DOCKERHUB_IMAGE` and `TAG`.
- For the admin experience, create and confirm Figma UI designs first; only build the clickable responsive backend prototype after the UI is approved.
- The future admin should cover common personal-blog management modules while preserving anonymous public memory submission, and should include first-class support for self-hosted Umami tracking.
- The admin prototype information architecture is: login, dashboard, content management with Memory/Page/Comment/Attachment sections, appearance with Theme/Menu sections, and system with Settings/Backup sections. Blog posts are folded into Memory; long-form Memory entries use a Read more affordance instead of a separate Posts module.
- The admin Menu section manages the public home page's original lower-right footer navigation, not the admin sidebar. Menu items can target editable pages, memories, searches, or external URLs.
- Editable menu pages and Memory content use Markdown. Published pages are mirrored into long-form Memory entries so footer clicks can use the same search-like discovery and Read more card behavior as normal memories.
- After UI direction is accepted, admin prototypes should be wired to real backend data and tested end to end before being treated as deliverable.
- The public intro/loading screen should support click/tap fast-forward so repeat visits can quickly see both intro message groups and enter the app.
- Public language switching should stay on the current route path: switching updates `ln` language text only for display, and route path (including `/memory/:id`) is preserved.
- Public and admin language controls are UI language only; they must not choose content collections, menu records, or admin list data. Backend/admin content uses the site default language from System Settings.
- Public memory URLs must be language-free `/memory/:id` routes using non-sequential random alphanumeric public IDs; legacy numeric memory URLs must not resolve memory content.
- Each memory may occupy only one map coordinate; deduplicate memory identity before passing posts into the legacy map/search rendering flow.
- Anonymous and admin-created memories publish immediately by default; do not require moderation unless an admin explicitly sets a non-published status.
- Public memory particles/search results must come only from real current memories. Empty memory datasets must not fall back to bundled legacy sample posts or interactive phantom points.
- Public search, add-memory, navigation ball, and opened memory-card layout must preserve the archive original positions and dimensions unless the user explicitly approves a visual change.
- Treat a memory as map-interactive only when it has a real identity and non-empty content and is currently public and published; never create or render Untitled placeholder memories.
- Compute the public fade percentage from recent real published-memory activity rather than keeping the archive's static 13% value.
- Keep `/admin/memory` as a list-only route and use `/admin/memory/editor?id=<public-id>` for editing; determine long-form behavior automatically from content exceeding the public card preview length.
- Footer Menu owns all public lower-right items, including built-ins; it supports one configurable `GROUP` level whose children can target pages, memories, searches, or external URLs, but children cannot contain another group.
- Settings uses separate Site, Account, and Security tabs; 2FA identity confirmation belongs to Security and must not reuse hidden state from the Account form.
- Do not commit generated QA artifacts, imported data snapshots, runtime database directories, SQLite files, or `db/`; SQLite runtime and migration paths are removed and must not be reintroduced.
- After modifying this repository, create a clean ccc-style Conventional Commit before handing work back.
