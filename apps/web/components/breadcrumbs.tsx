import Link from "next/link";

const CRUMB = "hover:text-neutral-900 desk:hover:text-white";
const CURRENT_CRUMB = "font-medium text-neutral-900 desk:text-white";

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
    <nav className="flex flex-wrap items-center gap-1 text-sm text-neutral-500 desk:text-neutral-300">
      <Link href={base} className={currentId ? CRUMB : CURRENT_CRUMB}>
        All items
      </Link>
      {crumbs.map((crumb) => (
        <span key={crumb.id} className="flex items-center gap-1">
          <span>/</span>
          <Link
            href={`${base}/${crumb.id}`}
            className={crumb.id === currentId ? CURRENT_CRUMB : CRUMB}
          >
            {crumb.title}
          </Link>
        </span>
      ))}
    </nav>
  );
}
