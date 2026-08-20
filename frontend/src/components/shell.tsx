"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { PageSkeleton, cn } from "@/components/ui";

const PUBLIC_PATHS = ["/login"];

type NavItem = {
  href: string;
  label: string;
  icon: "pipeline" | "coach" | "buddy" | "interview" | "resume" | "skills" | "social";
};

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Pipeline", icon: "pipeline" },
      { href: "/coach", label: "Coach", icon: "coach" },
      { href: "/buddy", label: "Buddy", icon: "buddy" },
      { href: "/interview", label: "Interview", icon: "interview" },
    ],
  },
  {
    label: "Create",
    items: [
      { href: "/resume", label: "Resume", icon: "resume" },
      { href: "/skills", label: "Skills", icon: "skills" },
      { href: "/social", label: "Social studio", icon: "social" },
    ],
  },
];

const MOBILE_NAV = NAV_GROUPS[0].items.slice(0, 3);
const MOBILE_MORE_NAV = [
  ...NAV_GROUPS[0].items.slice(3),
  ...NAV_GROUPS[1].items,
];

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(href));
}

function NavIcon({ name, className }: { name: NavItem["icon"]; className?: string }) {
  const paths: Record<NavItem["icon"], ReactNode> = {
    pipeline: <><rect x="3" y="4" width="7" height="7" rx="1.5" /><rect x="14" y="4" width="7" height="7" rx="1.5" /><rect x="3" y="15" width="7" height="5" rx="1.5" /><rect x="14" y="15" width="7" height="5" rx="1.5" /></>,
    coach: <><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 12.5z" /><path d="M8 8h8M8 11.5h5" /></>,
    buddy: <><path d="M4 13v-1a8 8 0 0 1 16 0v1" /><path d="M4 13a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2zM20 13a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2z" /><path d="M17 18c0 2-2 3-5 3" /></>,
    interview: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21a7 7 0 0 1 14 0M19 4v5M16.5 6.5h5" /></>,
    resume: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h4M9 12h6M9 16h6" /></>,
    skills: <><path d="m12 3 2.4 4.8L20 9l-4 3.9.9 5.6L12 16l-4.9 2.5.9-5.6L4 9l5.6-1.2z" /></>,
    social: <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="m8.2 10.8 7.5-3.6M8.2 13.2l7.5 3.6" /></>,
  };
  return (
    <svg aria-hidden className={cn("h-5 w-5", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function BrandMark() {
  return (
    <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--primary)] text-sm font-semibold text-white shadow-[var(--shadow-sm)]">
      A
    </span>
  );
}

function DesktopSidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  return (
    <aside className="app-chrome app-sidebar fixed inset-y-0 left-0 z-50 hidden w-60 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] lg:flex">
      <div className="flex h-16 items-center gap-3 border-b border-[var(--border)] px-5">
        <BrandMark />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-[var(--text)]">ApplyEngine</p>
          <p className="text-xs text-[var(--muted)]">Career workspace</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Primary navigation">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-2 px-3 text-xs font-medium text-[var(--muted)]">{group.label}</p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-[var(--nav-active)] text-[var(--text)]"
                        : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                    )}
                  >
                    <NavIcon name={item.icon} className={active ? "text-[var(--primary-2)]" : "text-[var(--muted-2)] group-hover:text-[var(--muted)]"} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-3 border-t border-[var(--border)] p-3">
        <Link href="/new" className="btn-interactive flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-3 text-sm font-medium text-white hover:bg-[var(--primary-dim)]">
          <span className="text-lg leading-none">+</span> New application
        </Link>
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--panel-3)] text-xs font-semibold text-[var(--text-secondary)]">
            {(user?.name || user?.email || "A").slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-[var(--text-secondary)]">{user?.name || user?.email}</p>
            <button type="button" onClick={logout} className="text-xs text-[var(--muted)] hover:text-[var(--text)]">Log out</button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function MobileChrome() {
  const { logout } = useAuth();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <header className="app-chrome app-mobile-header sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--sidebar)]/95 px-4 backdrop-blur lg:hidden">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark />
          <span className="text-sm font-semibold tracking-tight">ApplyEngine</span>
        </Link>
        <Link href="/new" className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--primary)] text-lg text-white" aria-label="New application">+</Link>
      </header>

      {moreOpen && (
        <div className="app-chrome fixed inset-x-3 bottom-[4.75rem] z-50 rounded-xl border border-[var(--border-strong)] bg-[var(--panel)] p-2 shadow-[var(--shadow-lg)] lg:hidden">
          {MOBILE_MORE_NAV.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--panel-2)]">
              <NavIcon name={item.icon} className="text-[var(--muted)]" />{item.label}
            </Link>
          ))}
          <button type="button" onClick={logout} className="flex min-h-11 w-full items-center rounded-lg px-3 text-sm text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]">Log out</button>
        </div>
      )}

      <nav className="app-chrome app-mobile-nav fixed inset-x-0 bottom-0 z-50 grid h-[4.25rem] grid-cols-4 border-t border-[var(--border)] bg-[var(--sidebar)]/98 px-2 pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Mobile navigation">
        {MOBILE_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center justify-center gap-1 text-[11px] font-medium", active ? "text-[var(--primary-2)]" : "text-[var(--muted)]")}>
              <NavIcon name={item.icon} className="h-[1.15rem] w-[1.15rem]" />{item.label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMoreOpen((value) => !value)} aria-expanded={moreOpen} className={cn("flex flex-col items-center justify-center gap-1 text-[11px] font-medium", moreOpen ? "text-[var(--primary-2)]" : "text-[var(--muted)]")}>
          <svg aria-hidden className="h-[1.15rem] w-[1.15rem]" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
          More
        </button>
      </nav>
    </>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (loading) return;
    if (!user && !isPublic) router.replace("/login");
    if (user && isPublic) router.replace("/");
  }, [user, loading, isPublic, router]);

  if (loading) return <div className="py-8"><PageSkeleton /></div>;
  if ((!user && !isPublic) || (user && isPublic)) return null;
  return <div className="page-enter">{children}</div>;
}

function AuthenticatedShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  const wide = pathname === "/coach" || pathname === "/buddy" || pathname.startsWith("/applications/") || pathname === "/social" || pathname.startsWith("/skills");

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {user && !isLogin && <><DesktopSidebar /><MobileChrome /></>}
      <div className={cn(user && !isLogin && "lg:pl-60")}>
        <main className={cn(
          "relative mx-auto min-w-0",
          isLogin ? "max-w-none p-0" : wide ? "max-w-[1600px] px-3 py-3 pb-24 sm:px-5 lg:px-6 lg:py-5 lg:pb-6" : "max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8 lg:pb-8"
        )}>
          <Gate>{children}</Gate>
        </main>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return <AuthProvider><AuthenticatedShell>{children}</AuthenticatedShell></AuthProvider>;
}
