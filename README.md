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

## Desktop board (Windows)

Runs the whiteboard as your desktop: your real icons sit on top and open as usual, and anywhere else is the board, over a tinted copy of your wallpaper. It uses a local production build on `127.0.0.1:3100` and an Edge app window, and needs the same database connection as the app.

```powershell
.\desktop\ability-desktop.ps1 start       # or: stop, status
.\desktop\ability-desktop.ps1 install     # also start at login (uninstall to undo)
.\desktop\ability-desktop.ps1 build       # rebuild after changing the app
```

- The `?` button on the board lists the mouse actions and hotkeys.
- `Ctrl+Alt+B` brings the board over your windows, and again sends it back.
- `Ctrl+Alt+Shift+B` hides the board, for example to drag or rearrange icons.
- `stop` restores your original wallpaper. Moving the taskbar or picking a new wallpaper rebuilds the background automatically.

## Roadmap — MVP 0.1

1. ✅ Monorepo scaffold and CI
2. ✅ Auth and an automatic personal workspace
3. ✅ Items CRUD API and list view
4. ✅ Nested boards (React Flow): create, move, connect, open, breadcrumbs
5. Browser extension: popup quick-add, context menu, shortcut
6. Production deploy on Vercel
