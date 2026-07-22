"use client";

import { cn } from "@/components/ui";
import type { ReactNode } from "react";

export type HubTabId = "chat" | "resume" | "interview" | "materials";

export function HubTabNav({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: HubTabId; label: string; icon?: ReactNode; description?: string }[];
  active: HubTabId;
  onChange: (id: HubTabId) => void;
}) {
  return (
    <div
      className="border-b"
      style={{ borderColor: "var(--border)" }}
    >
      <div
        className="-mb-px flex gap-1 overflow-x-auto overscroll-x-contain pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Application workspace"
      >
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`hub-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`hub-panel-${tab.id}`}
              data-active={isActive}
              onClick={() => onChange(tab.id)}
              className={cn(
                "btn-interactive group relative flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-medium",
                "border-b-2 transition-[color,border-color] motion-reduce:transition-none",
                isActive
                  ? "border-[var(--primary)] text-[var(--text)]"
                  : "border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:text-[var(--text)]"
              )}
            >
              <span
                className={cn(
                  "transition-opacity motion-reduce:transition-none",
                  isActive ? "opacity-100" : "opacity-60 group-hover:opacity-90"
                )}
              >
                {tab.icon}
              </span>
              <span className="whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function HubTabPanel({
  tabId,
  activeTab,
  title,
  description,
  headerExtra,
  children,
  flush,
}: {
  tabId: HubTabId;
  activeTab: HubTabId;
  title?: string;
  description?: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  if (activeTab !== tabId) return null;

  return (
    <div
      role="tabpanel"
      id={`hub-panel-${tabId}`}
      aria-labelledby={`hub-tab-${tabId}`}
      className="motion-safe:animate-fade-up"
      key={tabId}
    >
      <div
        className={cn(
          "overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--panel)]",
          "shadow-[var(--shadow-sm),inset_0_1px_0_rgba(255,255,255,0.04)]",
          flush ? "!p-0" : "p-0"
        )}
        style={{ borderColor: "var(--border)" }}
      >
        {(title || description || headerExtra) && (
          <div
            className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4 sm:px-6"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="min-w-0">
              {title && (
                <h2 className="text-base font-semibold tracking-tight">{title}</h2>
              )}
              {description && (
                <div className="mt-0.5 text-sm text-[var(--muted)]">{description}</div>
              )}
            </div>
            {headerExtra}
          </div>
        )}
        <div className={flush ? undefined : "p-4 sm:p-6"}>{children}</div>
      </div>
    </div>
  );
}
