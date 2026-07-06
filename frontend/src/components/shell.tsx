"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";

const PUBLIC_PATHS = ["/login"];

function NavBar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const navLink = (href: string, label: string) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`rounded-lg px-3 py-1.5 ${
          active
            ? "bg-[var(--panel-2)] text-[var(--text)]"
            : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-10 border-b bg-[var(--bg)]/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--primary)] text-white">
            ⚡
          </span>
          ApplyEngine
        </Link>
        {user && (
          <nav className="flex items-center gap-1 text-sm">
            {navLink("/", "Pipeline")}
            {navLink("/coach", "Coach")}
            {navLink("/interview", "Interview")}
            <Link
              href="/new"
              className="rounded-lg bg-[var(--primary)] px-3 py-1.5 font-medium text-white hover:bg-[var(--primary-2)]"
            >
              + New application
            </Link>
            <div className="ml-2 flex items-center gap-2 border-l pl-3" style={{ borderColor: "var(--border)" }}>
              <span className="hidden text-[var(--muted)] sm:inline">
                {user.name || user.email}
              </span>
              <button
                onClick={logout}
                className="rounded-lg px-3 py-1.5 text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
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
  return (
    <AuthProvider>
      <NavBar />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Gate>{children}</Gate>
      </main>
    </AuthProvider>
  );
}
