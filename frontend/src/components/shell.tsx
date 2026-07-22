"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Button, PageSkeleton, cn } from "@/components/ui";

const PUBLIC_PATHS = ["/login"];

const NAV = [
  { href: "/", label: "Pipeline" },
  { href: "/coach", label: "Coach" },
  { href: "/resume", label: "Resume" },
  { href: "/interview", label: "Interview" },
] as const;

function NavBar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] glass-panel !rounded-none !border-x-0 !border-t-0">
      <div className="mx-auto flex min-w-0 max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <Link
          href={user ? "/" : "/login"}
          className="group flex shrink-0 items-center gap-2.5 font-semibold tracking-tight"
        >
          <span className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)] bg-[length:200%_200%] shadow-[0_4px_20px_-4px_var(--glow)] [background-image:var(--gradient-brand)] transition-transform group-hover:scale-105">
            <Image src="/icons/spark.svg" alt="" width={18} height={18} aria-hidden />
          </span>
          <span className="hidden bg-gradient-to-r from-[var(--text)] to-[var(--muted)] bg-clip-text text-transparent sm:inline">
            ApplyEngine
          </span>
        </Link>

        {user && (
          <nav className="flex min-w-0 flex-1 items-center justify-end gap-0.5 overflow-x-auto sm:gap-1">
            {NAV.map(({ href, label }) => {
              const active =
                pathname === href || (href !== "/" && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "tab-pill btn-interactive shrink-0 rounded-[var(--radius-md)] px-2.5 py-2 text-xs font-medium sm:px-3 sm:text-sm",
                    active
                      ? "text-[var(--text)]"
                      : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                  )}
                  data-active={active}
                >
                  {label}
                </Link>
              );
            })}
            <Button href="/new" variant="gradient" size="sm" className="ml-1 shrink-0 sm:ml-2">
              <span className="sm:hidden">+</span>
              <span className="hidden sm:inline">New application</span>
            </Button>
            <div
              className="ml-1 flex shrink-0 items-center gap-1 border-l pl-2 sm:ml-2 sm:gap-2 sm:pl-3"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="hidden max-w-[120px] truncate text-xs text-[var(--muted)] lg:inline">
                {user.name || user.email}
              </span>
              <button
                type="button"
                onClick={logout}
                className="btn-interactive rounded-[var(--radius-md)] px-2.5 py-2 text-xs text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)] sm:text-sm"
              >
                Log out
              </button>
            </div>
          </nav>
        )}
      </div>
    </header>
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

  if (loading) {
    return (
      <div className="py-8">
        <PageSkeleton />
      </div>
    );
  }
  if (!user && !isPublic) return null;
  if (user && isPublic) return null;
  return <div className="page-enter">{children}</div>;
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isCoach = pathname === "/coach";
  const isApplication = pathname.startsWith("/applications/");
  const isLogin = pathname === "/login";
  const wide = isCoach || isApplication;

  return (
    <AuthProvider>
      <div className="relative min-h-screen overflow-x-hidden">
        {!isLogin && <NavBar />}
        <main
          className={cn(
            "relative mx-auto min-w-0 px-4 sm:px-6",
            wide ? "max-w-7xl py-3 sm:py-5" : isLogin ? "max-w-none py-0" : "max-w-6xl py-6 sm:py-8"
          )}
        >
          <Gate>{children}</Gate>
        </main>
      </div>
    </AuthProvider>
  );
}
