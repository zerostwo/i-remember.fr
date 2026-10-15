# Admin layout and memory links

## Proposed direction

Use the public archive's monochrome palette, serif headings, fine borders and
circular icon controls throughout login and admin. Keep dense form and table
text in a readable sans serif. Use a restrained static background on login;
keep the workspace quiet while editing. No public galaxy redesign.

## Layout

- Login: a centered owner sign-in form, one identity, a short welcome line,
  labelled email/password inputs, one primary action and a return-to-site link.
- Navigation: preserve Dashboard, Memories, Pages, Attachments, Navigation and
  Settings routes, collapsed sidebar, command search and mobile drawer.
- Page header: title and short description on the left, the page's primary
  action on the right. Keep visible labels and reachable actions on phones.
- Memory editor: writing and attachments in the main column; status, visibility,
  author and public link in a narrower publishing column. One consistent save
  intent; a working public preview link. Stack the columns on phones.
- Settings: retain Site, Account, Security and Backup tabs. Group Site into
  identity/search, publishing and analytics with consistent section dividers.
- Shared controls: consistent fields, selections, buttons, empty states and
  inline errors. Preserve keyboard focus, dirty-draft protection, loading and
  accessible touch targets.

## Public links

Generate eight-character nonsequential alphanumeric IDs. Let administrators
choose a 4–32 character ID using letters, digits and hyphens (starting with a
letter). Validate uniqueness and return a readable conflict error. Changing a
link must preserve old IDs as permanent aliases, without exposing private or
archived memories. Existing records, attachments, view totals and map identity
must keep their internal identity. Canonical metadata and new shared links use
the current ID. Convert existing generated long IDs with a reversible mapping
and preserved aliases only after a verified database/assets backup.

## Acceptance

Validate with a disposable PostgreSQL database and real API: creation, editing,
renaming, collisions, old links, visibility, gallery and view totals. Check
English login, editor, lists and settings on desktop and narrow/touch layouts.
Run repository tests, build, lint and typecheck. Deploy a digest-pinned single
Docker image, preserve the data mount and Umami settings, and verify production
health and data counts. Do not commit runtime data or disposable QA assets.

## Design gate

AGENTS.md requests confirmation of Figma designs before a replacement admin
layout. The Product Design and Figma tools are unavailable in this session.
This document is a concrete alternative direction for owner approval, not a
claim of Figma validation.

## Visual proposal (awaiting approval)

Open `admin-layout-preview.html` beside this document. Its top navigation switches
between Sign in, Dashboard, Editor and Settings. All memories and counters are
illustrative; buttons do not save or contact the production API. The editor
places writing/photos in the main column and publishing/link controls in the
secondary column. Settings separates section explanations from editable fields.
The proposal has desktop and stacked narrow-screen layouts.

The owner requested this visual proposal before deciding on implementation.
No replacement login, sidebar, editor layout or Settings layout is shipped in
the short-link release. Only the functional Public ID field changes in the
existing admin. Await explicit approval before connecting the proposed layout
to real admin workflows.
