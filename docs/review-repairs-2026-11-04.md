# Review repairs — 2026-11-04

The nine findings from the October 29 review are addressed without changes to
public CSS, visual assets, bundled galaxy renderer, or input gestures.

| Finding | Repair and regression |
| --- | --- |
| Closed submissions still accept uploads | All legacy image/video/audio/Live Photo upload routes check settings; an authenticated owner can continue. HTTP tests cover denied anonymous routes and an allowed owner session; client tests check authentication on chunks, status, completion and cancellation. |
| Deleted previews survive; upload buffers grow | Remove the permanent image-buffer map. HTTP regression removes an uploaded folder and verifies its preview returns 404. Media-library tests separately exercise reference-protected physical deletion. |
| Old sessions survive a password change | Signed tokens include a keyed credential fingerprint, checked against the current user before each routed API request. HTTP regression changes the password, rejects the old token and accepts a new login. Existing tokens require a fresh login after upgrade. |
| Search photo particles remain blank | Initialize the original bundled Post class and thumbnail loader. Regression executes that class and its preload callback, verifying decoded image state. |
| Search stops at 200 | Follow server cursors in bounded requests, deduplicate identities and suppress responses after another search/navigation. A 201-result regression exercises the submission path. |
| Invalid timezone crashes the list | Validate new settings; normalize invalid persisted runtime values; date rendering safely falls back to UTC. Tests cover rejection and rendering fallback. |
| Page footer toggle updates one entry | Update all entries targeting the same Page and language transactionally. PostgreSQL regression verifies two entries become hidden. |
| Older footer requests override navigation | Guard fetch completion and delayed overlays with a navigation generation. Tests cover out-of-order responses and leaving before the timer runs. |
| Page bodies repeatedly load in full | Page list queries are bounded and omit Markdown in the database query. Admin loads summaries, retrieves a full Page when editing, and explicitly paginates full bodies for exports. PostgreSQL regression traverses 205 additional Pages without duplicate IDs or bodies. |

## Validation

- Repository-pinned pnpm 10.17.1: build, typecheck, lint and full default test passed.
  Lint has no errors; five pre-existing warnings remain in ignored QA scratch code.
- Default tests now include PostgreSQL regressions, the Page workspace, media
  library, video, audio and Live Photo suites. CI installs their required tools.
- The database runner creates a disposable UTF-8 cluster, applies all six migrations,
  executes tests and stops/removes the cluster. An explicitly disposable test URL
  can be supplied instead. PostgreSQL 15 was used locally.
- Live Photo tests passed Apple native recognition and HEIC, pairing, key picture,
  sound, metadata sanitation and cleanup checks.
- In-app browser with a synthetic local database: login, Page deep-link load,
  list/reopen, save retaining complete Markdown, galaxy exploration/search,
  opening/closing a photo memory and reading a footer Page.
- Source diff leaves galaxy CSS, fonts, audio, image assets and main renderer unchanged.

No production deployment or production data changes were performed. Physical
phone touch/picker testing and the Docker container lifecycle were not executed
on this host; the Docker CI lifecycle/backup/restore gate remains required before
publishing. Local browser validation does not certify physical iOS/Android behavior.
