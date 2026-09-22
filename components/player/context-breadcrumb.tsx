import Link from "next/link";

export function ContextBreadcrumb({ parent, current, href }: { parent: string; current: string; href: string }) {
  return (
    <nav aria-label="ตำแหน่งปัจจุบัน" className="player-context-bar">
      <Link href={href}>{parent}</Link>
      <span aria-hidden="true">/</span>
      <strong aria-current="page">{current}</strong>
    </nav>
  );
}
