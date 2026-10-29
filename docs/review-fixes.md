# Review fixes — September 2026

The owner's latest direction is the original public presentation, including the
galaxy, staged interactions, opening sequence, typography, music, and sound
effects. The original renderer, stylesheet, fonts, images, and audio are retained.
Responsive overrides and runtime fixes adapt that experience to small screens.
English is the current default and preview language. The previous public
clean-room redesign item is superseded by this direction.

## Original audit closure

This table follows the original audit's numbering. Eleven defect items are
resolved; item 7 is superseded by the owner's subsequent instruction, rather
than counted as a completed redesign. These statuses describe the reproducible
findings, not a claim that all possible defects or deployment risks are excluded.

| Item                                                       | Result     | Implementation and verification                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Editing exposes private content                         | Resolved   | Update payloads preserve visibility/status. Actual PostgreSQL tests cover PRIVATE and UNLISTED drafts and anonymous access.                                                                                                                                                                                    |
| 2. Search clears the draft                                 | Resolved   | Stable draft identity, inline uploads, leave protection, and save/archive operation guards. Spotlight preservation was verified in the browser. Uploads become dirty immediately and are cancelled when the editor unmounts.                                                                                   |
| 3. Editing loses attachments                               | Resolved   | Unchanged attachments are omitted from PATCH. Explicit attachment edits retain IDs, MIME, metadata, and timestamps through differential updates; foreign/duplicate IDs and more than 24 attachments are rejected without data loss. Adapter, API, and PostgreSQL regressions cover add/edit/remove operations. |
| 4. The 200-record cap hides older content                  | Resolved   | Stable cursors and totals, complete admin/export/public iteration, and direct editor lookup. PostgreSQL checks cover 405 same-timestamp memories, 207 assets, and 407 public search results without omissions or duplicates.                                                                                   |
| 5. Unicode tags collapse into one tag                      | Resolved   | Unicode normalization and stable distinct slugs; tests cover separate Chinese tags across records and reuse of existing names with old slugs.                                                                                                                                                                  |
| 6. Mobile memory text is clipped                           | Resolved   | Responsive card bounds, scrollable content, reachable close controls, and short landscape layouts. Browser checks covered 320×568, 390×844, and 844×390, including reading and staged submission. Physical device behavior remains a validation limit below.                                                   |
| 7. Replace the original public identity/assets             | Superseded | The owner explicitly requested preservation of the original visuals, typography, galaxy, transitions, music, and interaction. No clean-room redesign is delivered or claimed.                                                                                                                                  |
| 8. Direct HTML exposes bundled sample posts                | Resolved   | Static entry URLs redirect to dynamic routes, and embedded sample datasets are empty. Actual HTTP tests verify redirects and current API content.                                                                                                                                                              |
| 9. Archived records cannot be restored                     | Resolved   | Owner access includes archived records; restoration preserves visibility. PostgreSQL tests verify both owner restoration and continued anonymous exclusion.                                                                                                                                                    |
| 10. Site settings do not affect public metadata/share URLs | Resolved   | Configured browser/OG titles, canonical URLs, and public/admin share URLs. Titles with ampersands are escaped once. Settings copy no longer promises changes to the preserved original introduction.                                                                                                           |
| 11. Markdown/read states and language controls disagree    | Resolved   | Shared safe CommonMark and current-content summaries, including short cards. Matching title headings and expanded excerpts are not duplicated. Public language strings remain centralized; current previews use English.                                                                                       |
| 12. Vite development does not reach the API                | Resolved   | Dev, preview, and production share proxy path rules. Live Vite HTTP tests verify auth status, readiness, and default/custom asset prefixes while preserving original public upload routes.                                                                                                                     |

The accompanying admin UI items are also addressed: responsive memory rows,
existing-record titles and Save changes state, explicit archive/restore actions,
and a current-content public preview. The preview now embeds the original public
card styles in an isolated, script-disabled frame instead of the former green
card design. It is labeled Mobile card to make its responsive presentation clear;
full-content preview uses the same safe Markdown body as the public reader.

## Resolved findings

- Editing a memory preserves its visibility and publication status. Updating
  text does not replace unchanged attachments or their identifiers and metadata.
- Opening admin search preserves an unsaved draft. Leaving a dirty editor asks
  before discarding it; uploads happen inline, and repeated saves are guarded.
- Memory and attachment APIs expose stable cursor pagination. Admin lists,
  search, and the public galaxy request bounded pages as needed; explicit exports consume every page. Public search uses
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

Run the repository-pinned pnpm 10.17.1 commands: `pnpm test`, `pnpm typecheck`,
`pnpm lint`, and `pnpm build`. All passed during the closure pass.
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

An actual logical backup and restore was also completed against the isolated
PostgreSQL 18.4 instance: all 11 tables and 32 rows matched by row count and full
row-content checksum after restoration into a separate database. The restored
database was then removed; the running source database was left intact.

Docker/Podman is unavailable on this host, so the PostgreSQL 15 single-image build
and complete container backup bundle (database, assets, and authentication secret)
were not executed locally. The existing Docker CI workflow requires its container
smoke/backup/restore checks, but no CI result is claimed for this unpushed commit.
Physical iOS/Android testing also remains unperformed. Production load testing,
a full security audit, and pixel-by-pixel Figma acceptance were outside this
defect-closure pass. Admin JSX still has `checkJs: false`; successful typecheck is
not represented as complete static typing of that UI.

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
