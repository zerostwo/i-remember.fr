# Admin visual consistency and touch review

Status: source review and proposed direction, not an implemented redesign or a
completed device acceptance test. Owner feedback was received on 2026-09-11.

## Findings

- The public interface uses its established serif-led, monochrome galaxy
  treatment. The admin uses Geist, blue-gray panels, rounded bordered cards,
  cream primary controls, and blue accents. Sharing a dark background alone
  does not give them a consistent identity.
- In `apps/admin/src/admin.css`, Site, Account, and Security have unrelated
  minimum card heights of 780px, 586px, and 492px. Account also overrides the
  card and field gaps. This creates different rhythms and excess empty space.
- Most settings use a centered 760px card, while Backup uses a wider two-column
  grid of four cards. Recovery warnings and server details dominate an area
  whose only browser action is content export.
- In `SettingsView`, Security exposes implementation copy such as "This state
  is isolated from the Account form" and explains how its card changes later.
  Those details should be replaced with concise instructions for the owner.
- Site's analytics fields rely on placeholders, while adjacent settings use
  persistent labels. Disabled analytics fields remain visible despite copy
  promising that enabling analytics reveals them.

## Touch findings

Existing code provides mobile drawer navigation, scroll locking, dialog focus
management, visual-viewport adaptation, safe-area spacing, 44px primary form
controls, and a card-like Memory list below 640px. Row menus have explicit click
handlers and 44px menu items. These are useful foundations.

Remaining issues and verification gaps:

1. Below 899px, direct top-bar buttons hide their text with `font-size: 0`.
   Save and export remain clickable but become less discoverable. Retain short
   visible action labels and test their fit alongside the page heading.
2. Settings tabs have minimum widths of 86px each below 620px. Four tabs plus
   container padding exceed the available content width on narrow phones.
   Make all four destinations visible or provide a deliberate alternate layout.
3. Shared Select items switch to smaller height and typography at 768px, even
   on touch tablets. Touch sizing must account for pointer type as well as
   viewport width. Portalled menus need the same theme as the main shell.
4. Touch acceptance must include scrolling while a field is focused, dismissing
   the keyboard, reaching Save, opening and dismissing menus, picking a file,
   returning without losing a draft, and reading long content.
5. Public galaxy drag, pinch, selection, search, staged photo submission, and
   reading must be tested separately. A mouse click test cannot establish
   gesture correctness or distinguish a drag from an intended selection.

## Proposed direction for review

Preserve the admin's existing routes and efficient management structure. Bring
its neutral colors, heading character, contrast, and visual restraint closer
to the home page. Keep form text highly readable. Reduce nested boxes and
decorative status panels.

Use one settings layout across Site, Account, Security, and Backup: consistent
content width, heading placement, field spacing, dividers, and action treatment;
height follows content. Keep backup scope clear with a concise export section
and a secondary link to server recovery documentation. Use persistent field
labels and short user-facing help.

On phones, use single-column forms, clearly named primary actions, generous
touch targets, explicit menu triggers, and vertical scrolling. Review desktop,
390px portrait, 320px portrait, landscape, and a touch tablet before approval.

This is a proposal. The existing AGENTS.md requirement to confirm the admin UI
design before a replacement prototype remains in effect. Product Design
get-context and Figma tools were not available in this session; the approved
Figma file was not re-opened or checked for pixel fidelity.

## Verification performed

- Inspected current admin JSX, CSS, shared form controls, and public runtime
  touch adaptations. Historical QA screenshots were not treated as current
  device evidence.
- `node scripts/check-mobile-ux.mjs` passed. This test checks source guardrails,
  not actual gesture behavior, rendered geometry, or saving through a backend.
- Started Vite on `http://127.0.0.1:5173` directly from the installed package
  after the available pnpm launcher failed its dependency check. Opened
  `/admin/` in the in-app browser; the page was blank. The HTML and admin entry
  endpoint returned HTTP 200, which does not establish successful rendering.
- No local API/PostgreSQL listener was available. Authenticated settings,
  persistence, and complete phone workflows were not verified. No live data or
  application UI was changed.
