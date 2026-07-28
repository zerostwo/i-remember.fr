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
