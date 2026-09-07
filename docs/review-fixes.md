# Review fixes — September 2026

The owner's latest direction is the original public presentation, including the
galaxy, staged interactions, opening sequence, typography, music, and sound
effects. The original renderer, stylesheet, fonts, images, and audio are retained.
Responsive overrides and runtime fixes adapt that experience to small screens.
English is the current default and preview language. The previous public
clean-room redesign item is superseded by this direction.

## Resolved findings

- Editing a memory preserves its visibility and publication status. Updating
  text does not replace unchanged attachments or their identifiers and metadata.
- Opening admin search preserves an unsaved draft. Leaving a dirty editor asks
  before discarding it; uploads happen inline, and repeated saves are guarded.
- Memory and attachment APIs expose stable cursor pagination. Admin lists,
  search, exports, and the public galaxy consume every page. Public search uses
  record order instead of comparing the random-derived legacy numeric handles.
- Unicode tag names generate distinct stable slugs, with existing tag names
  reused to avoid unique-name conflicts.
- Archived records remain accessible to the owner and can be restored while
  public access continues to enforce visibility and publication status.
- Public memory cards and submission controls fit narrow screens. Close actions
  remain reachable; long content scrolls. Admin memory rows become mobile cards.
- Direct HTML entry URLs redirect into the dynamic routes; bundled sample
  memories cannot leak through a static entry page.
- Site title and canonical URL feed public metadata, and the configured timezone
  is used for admin memory dates.
- Public long-form reading and admin previews use a shared CommonMark renderer.
  Expanded reading does not repeat the excerpt or matching title heading.
- Development requests use the configured API service, including admin uploads.
- The original audio starts when permitted and retries on interaction when
  autoplay is blocked. Hidden tabs suspend galaxy rendering. Thumbnail loading
  guards and image preload callbacks are corrected without replacing the renderer.

## Verification

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
`pnpm test:postgres` additionally requires `I_REMEMBER_TEST_DATABASE_URL` pointing
to a migrated disposable database whose name contains `test` or `review`. It
creates and removes its own records and verifies visibility, attachment identity,
archive restoration, tags, 405 memories, and 207 attachments across page boundaries.
An optional local `I_REMEMBER_TEST_PUBLIC_URL` also verifies public search paging.

Browser verification used an isolated PostgreSQL instance and English desktop
and 390-pixel layouts. It covered draft persistence through Spotlight, inline
uploads, private draft save/edit, original public photo/name/email/terms submission
and immediate publication, long-form reading, and active original audio playback.
Viewport checks do not substitute for testing the software keyboard and audio
policy on physical iOS and Android devices.
