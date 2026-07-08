# API App

The production server remains `server.mjs`; API behavior lives in
`src/server/revival.js` and the SQLite store under `src/server`.

Versioned routes are exposed at `/api/v1/*` for new HTTP agent and admin clients.
