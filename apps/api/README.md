# API App

TypeScript REST API for new platform clients.

- Dev: `pnpm --filter @i-remember/api dev`
- Build: `pnpm --filter @i-remember/api build`
- Test: `pnpm --filter @i-remember/api test`

Routes are exposed at `/api/v1/*` and flow through controller -> service ->
repository layers. Persistence is PostgreSQL via `@i-remember/database`; assets
use `@i-remember/storage`.
