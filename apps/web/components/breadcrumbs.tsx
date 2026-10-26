import Link from "next/link";

export function Breadcrumbs({
  base,
  crumbs,
  currentId,
}: {
  base: string;
  crumbs: { id: string; title: string }[];
  currentId?: string;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-neutral-500">
      <Link href={base} className={currentId ? "hover:text-neutral-900" : "font-medium text-neutral-900"}>
        All items
      </Link>
      {crumbs.map((crumb) => (
        <span key={crumb.id} className="flex items-center gap-1">
          <span>/</span>
          <Link
            href={`${base}/${crumb.id}`}
            className={crumb.id === currentId ? "font-medium text-neutral-900" : "hover:text-neutral-900"}
          >
            {crumb.title}
          </Link>
        </span>
      ))}
    </nav>
  );
}
