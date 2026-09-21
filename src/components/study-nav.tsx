"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUPS = [
  {
    label: "09.07-09.15",
    studies: [
      { href: "/", label: "05" },
      { href: "/05_2", label: "05_2" },
      { href: "/05_3", label: "05_3" },
      { href: "/06", label: "06" },
      { href: "/07", label: "07" },
      { href: "/08_system", label: "08_system" },
      { href: "/09_system", label: "09_system" },
      { href: "/09_2", label: "09_2" },
      { href: "/09_3", label: "09_3" },
      { href: "/09_4", label: "09_4" },
      { href: "/10_1", label: "10_1" },
      { href: "/10_push/button", label: "10_push" },
      { href: "/10_push_2", label: "10_push_2" },
    ],
  },
  {
    label: "09.16-09.21",
    studies: [
      { href: "/10_3", label: "10_3" },
      { href: "/11", label: "11" },
      { href: "/11_1", label: "11_1" },
      { href: "/11_2", label: "11_2" },
      { href: "/10_4", label: "10_4" },
      { href: "/10_5", label: "10_5" },
    ],
  },
] as const;

export function StudyNav({ className }: { className?: string }) {
  const path = usePathname() ?? "/";
  return <nav className={["study-nav", className].filter(Boolean).join(" ")} aria-label="Studies">
    {GROUPS.map(group => {
      const current = group.studies.some(({ href }) => href === path);
      return <details key={group.label} className="study-archive">
        <summary className="study-archive-label" aria-current={current ? "true" : undefined}>{group.label}</summary>
        <div className="study-archive-menu">
          {group.studies.map(({ href, label }) =>
            <Link key={href} href={href} aria-current={href === path ? "page" : undefined}>{label}</Link>)}
        </div>
      </details>;
    })}
  </nav>;
}
