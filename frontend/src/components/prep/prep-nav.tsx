"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/prep", label: "Today" },
  { href: "/prep/plan", label: "Plan" },
  { href: "/prep/feedback", label: "Feedback" },
  { href: "/prep/settings", label: "Settings" },
];

/** Switches between the Interview Prep screens; styled like TabBar. */
export function PrepNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Interview Prep"
      className="mb-5 inline-flex flex-wrap gap-1 rounded-[var(--radius-lg)] border bg-[var(--panel)]/80 p-1 backdrop-blur-sm"
      style={{ borderColor: "var(--border)" }}
    >
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            data-active={active}
            className="tab-pill btn-interactive inline-flex items-center rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--text)]"
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
