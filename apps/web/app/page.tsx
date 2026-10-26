import { eq, getDb, members, workspaces } from "@ability/db";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const userWorkspaces = await getDb()
    .select({ id: workspaces.id, name: workspaces.name })
    .from(members)
    .innerJoin(workspaces, eq(members.workspaceId, workspaces.id))
    .where(eq(members.userId, session.user.id));

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Hi, {session.user.name}</h1>
        <SignOutButton />
      </header>
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-neutral-500">Your workspaces</h2>
        <ul className="space-y-2">
          {userWorkspaces.map((w) => (
            <li key={w.id} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
              {w.name}
            </li>
          ))}
        </ul>
      </section>
      <p className="text-sm text-neutral-500">The whiteboard comes next.</p>
    </main>
  );
}
