import { getDb, members, workspaces } from "@ability/db";
import * as schema from "@ability/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

function https(host: string | undefined) {
  return host ? `https://${host}` : undefined;
}

// On Vercel, use the production domain in production and the branch URL in previews.
function vercelUrl() {
  if (process.env.VERCEL_ENV === "production") return https(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  return https(process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL);
}

export function slugify(input: string) {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `${base || "workspace"}-${crypto.randomUUID().slice(0, 6)}`;
}

function createAuth() {
  const db = getDb();
  const google =
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }
      : undefined;

  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? vercelUrl(),
    trustedOrigins: [
      https(process.env.VERCEL_PROJECT_PRODUCTION_URL),
      https(process.env.VERCEL_BRANCH_URL),
      https(process.env.VERCEL_URL),
    ].filter((o): o is string => !!o),
    // neon-http has no interactive transactions.
    database: drizzleAdapter(db, { provider: "pg", schema, transaction: false }),
    emailAndPassword: { enabled: true },
    socialProviders: google ? { google } : {},
    databaseHooks: {
      user: {
        create: {
          // Every new user gets a personal workspace they own.
          after: async (user) => {
            const [workspace] = await db
              .insert(workspaces)
              .values({ name: `${user.name || "My"}'s workspace`, slug: slugify(user.email.split("@")[0] ?? "") })
              .returning({ id: workspaces.id });
            await db.insert(members).values({ workspaceId: workspace!.id, userId: user.id, role: "owner" });
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

let auth: Auth | undefined;

export function getAuth() {
  return (auth ??= createAuth());
}
