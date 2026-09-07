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

## Follow-up optimization

- Generate Brotli and gzip sidecars during the build, and serve the encoding
  accepted by the browser. Original images, fonts, music, and renderer source
  remain unchanged. The original main script transfers as 140,577 Brotli bytes
  instead of 560,821 bytes (75% less); this measures transfer size, not frame rate.
- Revalidate stable asset and admin entry URLs with ETag/Last-Modified after
  deployments. Content-hashed build assets receive long-lived immutable caching.
- Correct audio suffix ranges and clamp requested end offsets to the file length;
  handle conditional requests and close streams when downloads are cancelled.
  These follow [HTTP range semantics](https://www.rfc-editor.org/rfc/rfc9110.html#name-range).
- Abort superseded public requests at the network layer, preventing obsolete
  responses from changing the current memory. The browser test-data adapter now
  also uses record order for pagination, matching the previously corrected server.
- Add the short landscape breakpoint, keep the memory close button reachable
  while scrolling, and allow submission content to scroll above its actions.
  Coalesce viewport resize/scroll events into one animation frame. Pinch zoom is
  distinguished from a keyboard using viewport scale and input focus.

The additional `check-static-assets.mjs` suite verifies actual HTTP responses and
byte-for-byte decompression. `check-public-runtime.mjs` executes the shipping
request, pagination, and viewport functions with controlled browser boundaries.
Browser checks also covered 320×568 and 844×390 layouts: scrollable memory cards,
full reading and close actions, and the landscape photo/name/email/content form
through the reachable terms area. Original background audio was actively playing.
