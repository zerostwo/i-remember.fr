# Web App

The public archive experience still boots from the root `index.html`, `fr.html`,
`public/css/main.css`, and `public/js/revival-runtime.js` files.

Those files are the visual source of truth and should not move until a dedicated
frontend migration can prove pixel and interaction parity.

`packages/memory-engine` owns reusable galaxy data normalization and the
`MemoryGalaxy` adapter used by future public, admin, and AI surfaces.
