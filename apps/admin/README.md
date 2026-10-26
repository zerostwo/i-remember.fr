# Admin App

React admin workspace for the Figma V2 `songqi.org` private control surface.
The complete application, styles, API adapters, and adapter checks live in this
package; the root Vite build consumes `src/main.jsx` directly.

Launch information architecture:

- Dashboard
- Memories and the dedicated memory editor
- Pages
- Attachments
- Navigation
- Settings with Site, Account, Security, and Backup tabs

Global search is a Spotlight overlay opened with Command-K or Control-K.
Comments and Theme remain absent until they have end-to-end product behavior.

- Dev: `pnpm --filter @i-remember/admin dev`
- Build: `pnpm --filter @i-remember/admin build`
- Test: `pnpm --filter @i-remember/admin test`

The writing workspace separates content from publishing settings. Pages use
`/admin/pages/editor?slug=<key>` and new pages remain unsaved drafts until saved.
The media library previews photos, videos, audio and Live Photos, shows where a
file is used, and removes individual memory references without deleting shared
storage. Editors can reuse media and change cover order; Page Markdown can insert
library photos or file links. Page publication and footer-key changes use a single
PostgreSQL transaction.

See `docs/admin-workspace-review-2026-10-25.md` for audit findings and validation.
Run `pnpm test:admin-workspace` with `I_REMEMBER_TEST_DATABASE_URL` pointing to a
migrated disposable test/review database for publication and shared-media checks.
