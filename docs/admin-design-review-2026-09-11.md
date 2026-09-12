# Admin visual consistency and touch review

Status: repaired and verified locally on 2026-09-12 after owner authorization.
The original findings below describe the pre-repair state. Mobile acceptance
uses browser touch emulation, not physical-device certification.

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

## Accepted direction

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

The owner subsequently authorized these repairs directly. This scoped approval
is recorded in AGENTS.md. Product Design get-context and Figma tools were not
available; this repair does not claim pixel fidelity to the earlier Figma file.

## Initial audit verification

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


## Implemented repairs

- Matched the public interface's neutral dark surfaces and serif heading
  character while retaining readable form text, existing admin routes, and
  page-aware actions. Reduced card rounding, nested boxes, and decorative space.
- Unified Site, Account, Security, and Backup widths, headers, spacing, and
  dividers. Removed fixed settings and dashboard card heights. Simplified
  Backup into an export action and expandable recovery guidance; removed
  implementation details from Security instructions.
- Added persistent analytics field labels and revealed those fields only when
  Umami is enabled. Added reachable bottom Save actions for Site and Account.
- Kept all four settings tabs visible at 320px, restored mobile action labels,
  retained single-column mobile forms, and enforced 44px select/touch targets.
  Select portals now inherit the admin theme. Added semantic settings panels
  and explicit search-overlay dismissal. Fixed the Dashboard backup shortcut
  to open the Backup tab and cleared stale notices when navigating.
- Added email keyboard hints to the public form without altering its appearance.
  Real touch testing found that the legacy input controller suppressed native
  taps on the long-memory reading button. The button and reading overlay now
  use the controller's existing native-input exemption, preserving tap and
  scroll behavior without synthesizing duplicate mouse events.
- Fixed blank Vite admin previews: the development middleware now transforms
  admin HTML and permits the precise module paths Vite needs. Added regression
  checks for actual imported JS/CSS, refresh setup, and private-path denial.
  Development exceptions remain disabled in production and Vite preview.

## Repair verification

All state-changing checks used a disposable local PostgreSQL database and real
API, with generated test credentials and synthetic content. Production data
was not used. QA files and database/runtime artifacts are excluded from Git.

- Full build, typecheck, ESLint, project tests, and whitespace checks passed.
- Built production preview on port 7890: authenticated all admin destinations,
  inspected all four settings tabs, checked for overflow, verified the backup
  shortcut, and observed no page errors or failed resource requests.
- Touch contexts at 320x740, 390x844, 844x390, and 1024x768: login, drawer
  navigation, settings tabs, themed selects, analytics toggling, persisted Site
  save, backup download, and Spotlight search into the editor passed.
- Phone editor: new content with an attachment, draft retention while opening
  and closing search, publication, reload, editing, saving, and row-menu
  navigation passed. A reduced available height of 440px checked action reach.
- Public phone workflows: intro, single-finger galaxy drag, two-finger zoom,
  search results, staged photo upload, name/email/content, terms, immediate
  anonymous publication, direct memory opening, and long-form reading passed.
  Long-form reading was opened with a native tap, scrolled with touch events,
  closed, and returned to the map.
- Reviewed desktop and phone screenshots in English. Opened the running local
  preview in the in-app browser.

Limitations: emulation cannot certify physical iOS/Android soft-keyboard or
system photo-picker behavior. Tests selected a local file through the browser's
file chooser and simulated reduced viewport height; they did not operate a
phone's native keyboard or gallery. Galaxy gestures and search were verified,
while direct particle hit-testing across physical GPUs remains outside this
local acceptance run. Account credentials and 2FA enrollment were not changed.
