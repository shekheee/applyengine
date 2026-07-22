"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./utils";

export function AlertBanner({
  tone = "error",
  children,
  className,
}: {
  tone?: "error" | "warning" | "info";
  children: ReactNode;
  className?: string;
}) {
  const styles = {
    error: "border-red-500/30 bg-red-500/10 text-red-200",
    warning: "border-amber-500/30 bg-amber-500/8 text-amber-100",
    info: "border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_8%,var(--panel))] text-[var(--text-secondary)]",
  };

  return (
    <div
      role="alert"
      className={cn(
        "rounded-[var(--radius-md)] border px-4 py-3 text-sm leading-relaxed",
        styles[tone],
        className
      )}
    >
      {children}
    </div>
  );
}

export function ProfileRequiredBanner() {
  return (
    <AlertBanner tone="warning">
      Upload your <strong className="text-[var(--text)]">base resume</strong> on the{" "}
      <Link href="/resume" className="font-medium text-[var(--primary-2)] underline underline-offset-2">
        Resume
      </Link>{" "}
      page before starting. Questions and feedback are grounded in your real profile.
    </AlertBanner>
  );
}

export function InterviewLoadingState({ embedded = false }: { embedded?: boolean }) {
  return (
    <div
      className={cn("page-enter space-y-6", embedded ? "py-2" : "py-4")}
      aria-busy
      aria-label="Loading interview practice"
    >
      <div className="space-y-2">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="skeleton h-4 w-72 max-w-full rounded-lg" />
      </div>
      <div className="skeleton h-12 w-full max-w-md rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-20 rounded-xl" />
        ))}
      </div>
      <div className="skeleton h-48 rounded-xl" />
    </div>
  );
}
