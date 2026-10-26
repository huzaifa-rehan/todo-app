# Ability

A todo and project management tool built around an **infinite nested whiteboard**. The root board is an aerial, flowchart-style view of your projects and tasks. Opening a project zooms into its own board, and boards nest as deep as you need. A browser extension handles quick capture.

Order of use: solo → office team → SaaS.

## Stack

| Part | Tech |
| --- | --- |
| Web app | Next.js (App Router), Tailwind, React Flow — deployed on Vercel |
| API | Hono at `/api/v1`, mounted inside Next.js, with a typed client shared with the extension |
| Database | Postgres (Neon) + Drizzle ORM |
| Auth | Better Auth (email + password; Google when configured) |
| Extension | WXT, Manifest V3 (planned) |
| Monorepo | pnpm workspaces + Turborepo |

```
apps/web          Next.js app (also serves the API)
packages/api      Hono routes + typed client
packages/db       Drizzle schema, migrations, client
packages/shared   zod schemas and shared types
```

## Data model

- `items` — every project, task and note. `parent_id` forms a tree; any item can have children, and that is the nesting.
- `board_nodes` — where an item sits on its parent's board (`board_owner_id`, null = root). Layout is kept apart from the data, so list, kanban and board are different views of the same items.
- `edges` — flowchart connections between items on a board.
- Every row has `workspace_id`, so it is ready for multiple tenants from day 1.

## Development

```bash
corepack enable          # or: npm i -g pnpm
pnpm install
cp .env.example .env     # set DATABASE_URL and BETTER_AUTH_SECRET
pnpm dev                 # http://localhost:3000
pnpm lint && pnpm typecheck && pnpm test
pnpm db:generate         # create a migration from the schema
pnpm db:migrate          # apply migrations
```

## Roadmap — MVP 0.1

1. ✅ Monorepo scaffold and CI
2. ✅ Auth and an automatic personal workspace
3. ✅ Items CRUD API and list view
4. Nested boards (React Flow): create, move, connect, open, breadcrumbs
5. Browser extension: popup quick-add, context menu, shortcut
6. Production deploy on Vercel
