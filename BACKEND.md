# I Remember Backend

The backend follows a lightweight self-hosted pattern inspired by
`usememos/memos`: one app process, an app-owned data directory, SQLite as the
default database, SQL migrations, and local filesystem attachment storage.

## Runtime Model

- Database: SQLite at `${I_REMEMBER_DATA_DIR}/i-remember.sqlite`.
- Images: local files below `${I_REMEMBER_DATA_DIR}/uploads`.
- Migrations: `src/server/migrations/sqlite/*.sql`, applied automatically on startup.
- Archive import: the restored HTML `DEFAULT_POSTS` payload is imported
  idempotently on startup; generated `data/` snapshots are not committed.
- Admin auth: password-checked session cookies, optional TOTP 2FA, and account
  settings stored in SQLite.

## Public Safety Defaults

- New public submissions default to `PENDING` and are not returned by public
  search or direct memory routes.
- Set `I_REMEMBER_ANONYMOUS_SUBMISSIONS=false` or use Admin Settings to close
  public anonymous submissions.
- Set `I_REMEMBER_AUTO_APPROVE_SUBMISSIONS=true` only for trusted/private
  deployments where immediate publishing is intended.
- Public memory `name` and `text` fields are treated as plain text and encoded
  before they enter the legacy browser API envelope.
- Uploads are capped by `I_REMEMBER_MAX_UPLOAD_BYTES` and decoded with a pixel
  limit from `I_REMEMBER_MAX_IMAGE_PIXELS`.
- JSONP is disabled; API responses are JSON only.
- User content injected into legacy inline scripts is serialized with script-safe
  escaping.
- The archived frontend still contains a bundled legacy jQuery 1.x runtime.
  `public/js/revival-runtime.js` installs a compatibility hardening layer for
  prototype-pollution merges, script-preserving HTML parsing, dynamic JSONP, and
  external script injection without changing the visual UI.

## Public Deployment Notes

- Put the app behind a TLS-terminating reverse proxy or managed edge.
- Mirror the upload size limit at the proxy with a matching request body limit.
- Back up `${I_REMEMBER_DATA_DIR}`; it contains both SQLite data and uploaded
  images.
- Keep `I_REMEMBER_AUTO_APPROVE_SUBMISSIONS=false` unless a separate moderation
  process is added.
- The CSP intentionally allows legacy inline/eval script behavior for the
  restored archive UI. Tightening this requires rebuilding the archived frontend
  bundle.

## Commands

```bash
npm run db:import
npm run build
npm start
```

Docker Compose persists the data directory with the `i-remember-data` named
volume.
