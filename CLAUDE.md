# CLAUDE.md

pnpm + Turborepo monorepo. See README.md for the architecture and data model.

## Commands
- `pnpm dev` / `pnpm build`
- `pnpm lint && pnpm typecheck && pnpm test` — run all three before committing
- `pnpm db:generate` / `pnpm db:migrate` (need `DATABASE_URL`)
- One package only: `pnpm --filter @ability/api test`

## Conventions
- Workspace packages export TypeScript source (no build step); add any new one to `transpilePackages` in `apps/web/next.config.ts`.
- Input validation schemas live in `packages/shared`; the API and the clients both import them.
- Every table has `workspace_id`, and every query must filter by it.
- Chain Hono routes (`app.get(...).post(...)`) so `AppType` stays fully typed.
- Branch per feature, then a PR to `main`.
