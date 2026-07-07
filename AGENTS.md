# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Current backend/product decisions:

- Keep the restored archive UI visually unchanged while modernizing the backend.
- Use the admin-configured default language for `/`, missing `ln`, and bare `/memory/:id` routes; the initial default is English.
- Preserve French support and add full Chinese support at `/zh` and `/zh/memory/:id`.
- Use a Memos-inspired self-hosted backend: SQLite by default, app-local data directory, local filesystem image storage, and SQL migrations. AI memory search is intentionally removed from the current version until it is explicitly revisited.
- Expose first-pass AI agent support through HTTP APIs, not MCP.
- Keep Facebook and Instagram API modernization out of scope until explicitly requested.
- Publish through an app-only Docker image; DockerHub image name and tag must come from `DOCKERHUB_IMAGE` and `TAG` env vars.
- For the admin experience, create and confirm Figma UI designs first; only build the clickable responsive backend prototype after the UI is approved.
- The future admin should cover common personal-blog management modules while preserving anonymous public memory submission, and should include first-class support for self-hosted Umami tracking.
- The admin prototype information architecture is: login, dashboard, content management with Memory/Page/Comment/Attachment sections, appearance with Theme/Menu sections, and system with Settings/Backup sections. Blog posts are folded into Memory; long-form Memory entries use a Read more affordance instead of a separate Posts module.
- The admin Menu section manages the public home page's original lower-right footer navigation, not the admin sidebar. Menu items can target editable pages, memories, searches, or external URLs.
- Editable menu pages and Memory content use Markdown. Published pages are mirrored into long-form Memory entries so footer clicks can use the same search-like discovery and Read more card behavior as normal memories.
- After UI direction is accepted, admin prototypes should be wired to real backend data and tested end to end before being treated as deliverable.
- Do not commit generated QA artifacts, imported data snapshots, runtime database directories, SQLite files, or `db/`; keep migration source under `src/server/migrations/sqlite`.
- After modifying this repository, create a clean ccc-style Conventional Commit before handing work back.
