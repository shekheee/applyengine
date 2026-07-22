"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";

const PUBLIC_PATHS = ["/login"];

function NavBar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const navLink = (href: string, label: string) => {
    const active = pathname === href || (href !== "/" && pathname.startsWith(href));
    return (
      <Link
        href={href}
        className={`tab-pill shrink-0 rounded-lg px-2 py-1.5 sm:px-3 ${
          active
            ? "bg-[var(--panel-2)] text-[var(--text)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_35%,transparent)]"
            : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
        }`}
        data-active={active}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-10 overflow-x-hidden border-b bg-[var(--bg)]/80 backdrop-blur">
      <div className="mx-auto flex min-w-0 max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--primary)] shadow-[0_4px_16px_-4px_var(--glow)]">
            <Image src="/icons/spark.svg" alt="" width={16} height={16} aria-hidden />
          </span>
          <span className="hidden sm:inline">ApplyEngine</span>
        </Link>
        {user && (
          <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto text-xs sm:gap-1 sm:text-sm">
            {navLink("/", "Pipeline")}
            {navLink("/coach", "Coach")}
            {navLink("/resume", "Resume")}
            {navLink("/interview", "Interview")}
            <Link
              href="/new"
              className="shrink-0 rounded-lg bg-[var(--primary)] px-2 py-1.5 font-medium text-white hover:bg-[var(--primary-2)] sm:px-3"
            >
              <span className="sm:hidden">+</span>
              <span className="hidden sm:inline">+ New application</span>
            </Link>
            <div
              className="ml-1 flex shrink-0 items-center gap-1 border-l pl-2 sm:ml-2 sm:gap-2 sm:pl-3"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="hidden text-[var(--muted)] sm:inline">
                {user.name || user.email}
              </span>
              <button
                onClick={logout}
                className="shrink-0 rounded-lg px-2 py-1.5 text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)] sm:px-3"
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
      <div className="grid min-h-[60vh] place-items-center text-[var(--muted)]">
        Loading…
      </div>
    );
  }
  if (!user && !isPublic) return null;
  if (user && isPublic) return null;
  return <>{children}</>;
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isCoach = pathname === "/coach";
  const isApplication = pathname.startsWith("/applications/");
  const wide = isCoach || isApplication;

  return (
    <AuthProvider>
      <div className="min-h-screen overflow-x-hidden">
        <NavBar />
        <main
          className={`mx-auto min-w-0 px-4 sm:px-6 ${
            wide ? "max-w-7xl py-3 sm:py-4" : "max-w-6xl py-8"
          }`}
        >
          <Gate>{children}</Gate>
        </main>
      </div>
    </AuthProvider>
  );
}
