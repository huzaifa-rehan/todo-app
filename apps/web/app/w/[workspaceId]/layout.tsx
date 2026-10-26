import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getWorkspaceForUser } from "@/lib/workspace";
import { SignOutButton } from "../../sign-out-button";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { workspaceId } = await params;
  const workspace = await getWorkspaceForUser(workspaceId, session.user.id);
  if (!workspace) notFound();

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between h-14 border-b border-neutral-200 bg-white px-4">
        <Link href={`/w/${workspace.id}/board`} className="font-semibold">
          {workspace.name}
        </Link>
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <span className="hidden sm:inline">{session.user.email}</span>
          <SignOutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
