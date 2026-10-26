# Admin usability review and repairs — 2026-10-25

Reviewed the running English admin against an isolated PostgreSQL database and
real API. All review content and media were synthetic; production was not changed.
The existing dark visual language and public galaxy remain in place.

## Observed problems and repairs

| Observed problem | Repair |
| --- | --- |
| Attachments displayed image thumbnails and MIME/storage identifiers, with no useful preview or ownership context. | A searchable media library with type filters, photo/video/audio/Live Photo presentation, full-image viewing, native playback, downloads, and links to the memories using a file. |
| The library automatically selected the first memory for uploads. There was no progress or cancellation UI. | Explicit memory selection, upload/processing progress, cancellation, duplicate-operation protection and errors. Navigation waits for a library upload to finish or be cancelled. |
| Memory attachments were filenames with Remove buttons; cover order and reuse were unavailable. | Visual attachment tiles, previews, move-earlier/later controls, cover identification, and a library picker. Saves preserve attachment identities and restore their explicit order on reload. |
| Deleting a shared asset through the storage endpoint removed all references. | Library actions explicitly remove a file from one memory; shared files and other memories stay intact. This is detachment, not physical storage reclamation. |
| Publishing fields and unused location information preceded the writing area. | Writing first, a separate publishing rail, Markdown formatting controls and a Write/Preview switch. Attachment controls stay alongside content. |
| Page creation immediately persisted an Untitled placeholder; list and editor were mixed together, with duplicate New page buttons. | Separate searchable list and `/admin/pages/editor` routes. New pages stay local until saved. Title-based key suggestions, draft/published/archived states, proper empty states and deep-link refresh support. |
| JSON metadata and an irrelevant Location field dominated Page editing. | Content-first editing, an optional summary, publishing controls and library media insertion. Metadata is retained without exposing raw JSON in routine writing. Photos insert inline; other media insert as links. |
| Page edits vanished when navigating; settings and navigation edits had similar gaps. | A shared accessible unsaved-changes dialog for in-app navigation, plus browser unload protection. Save locks prevent overlapping writes. Keep editing preserves the draft; Discard changes performs the intended navigation. |
| Any Page PATCH error fell back to POST; Page and its public memory saved in separate requests. | Explicit create/edit intent; edits never retry as creation. PostgreSQL atomically saves a page, its public mirror and renamed footer targets. Row locking prevents duplicate mirrors during concurrent publication. |
| Short published pages lost their Read more reader because they fit within the card excerpt. | Managed pages retain their full reading action regardless of excerpt length. |
| Renaming a page could leave stale menu targets, and clearing a summary did not clear stored text. | Same-transaction target updates and explicit empty-summary persistence. Conflicts roll back the complete operation with a readable error. |
| Dashboard suggested a backup snapshot existed by showing a fixed “Manual” metric. | Replaced it with real media/page counts; optional analytics setup is described as a tool, not an inferred fault. |
| Sidebar search found pages but opened only the generic Pages list. | Search results open the selected page editor. Memory titles now directly open their editor. |

## Verification

- Browser: owner login; Page creation, save, publication, editor deep-link reload;
  Markdown formatting/preview and insertion of an existing photo; unsaved-change
  Keep editing and Discard changes (including settings tabs); media-library ownership
  and editor navigation.
- Browser: real file chooser upload of a JPEG, MP3 and MP4; observed processing
  completion; audio playback and video playback through its four-second duration
  (`readyState=4`, no media error); full-image preview and dialog dismissal.
- Browser: reuse an existing photo in another memory, move it to the cover,
  save and reload, confirming retained order and shared usage count.
- Layout: desktop and narrow browser viewports, including a 390px editor/photo
  viewer and a 320px media library with no document horizontal overflow. This is responsive browser
  validation, not physical iOS/Android touchscreen, keyboard or picker certification.
- PostgreSQL regression suite: concurrent page publication produces one mirror;
  publish, draft, archive, restore, key rename and menu integrity; collision and
  empty-publication rollback; summary clearing; shared-media detachment isolation.
- Repository build, tests, typecheck and lint. The machine's default pnpm launcher
  attempted a dependency reinstall, so verification uses the repository-pinned
  pnpm 10.17.1. Existing lint warnings in ignored QA scratch files are unrelated.

## Boundaries

No production deployment, production data migration, public visual redesign,
account-password change or 2FA change was performed. Existing media conversion
and Live Photo sanitization pipelines are reused. A removed attachment's physical
file is deliberately retained, because another memory or Markdown page may use it.
Page publishing transactions apply to the production PostgreSQL repository.
The included documentation screenshot uses synthetic local content.
