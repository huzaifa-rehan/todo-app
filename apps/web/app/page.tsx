import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getUserWorkspaces } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const [first] = await getUserWorkspaces(session.user.id);
  if (!first) return <main className="p-6">You don&apos;t have a workspace yet.</main>;
  redirect(`/w/${first.id}/list`);
}
