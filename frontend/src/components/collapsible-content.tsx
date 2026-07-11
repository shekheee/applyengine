"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

const COLLAPSED_MAX_PX = 96; // ~4 lines at text-sm leading-relaxed
const COLLAPSE_CHAR_THRESHOLD = 280;

export function shouldCollapseContent(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const lines = trimmed.split("\n").length;
  return lines > 4 || trimmed.length > COLLAPSE_CHAR_THRESHOLD;
}

export function CollapsibleContent({
  children,
  defaultExpanded = false,
  disabled = false,
  className = "",
  variant = "assistant",
}: {
  children: ReactNode;
  defaultExpanded?: boolean;
  disabled?: boolean;
  className?: string;
  variant?: "user" | "assistant";
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [overflows, setOverflows] = useState(false);
  const innerRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const toggleClass =
    variant === "user"
      ? "text-white/85 hover:text-white"
      : "text-[var(--primary-2)] hover:underline";

  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);

  useEffect(() => {
    if (disabled) {
      setOverflows(false);
      return;
    }
    const el = innerRef.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollHeight > COLLAPSED_MAX_PX + 8);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children, disabled]);

  const collapsible = !disabled && overflows;
  const showCollapsed = collapsible && !expanded;

  return (
    <div className={`min-w-0 max-w-full overflow-hidden ${className}`}>
      <div className="relative">
        <div
          id={id}
          ref={innerRef}
          className="overflow-hidden transition-[max-height] duration-200 ease-out"
          style={{
            maxHeight: showCollapsed ? `${COLLAPSED_MAX_PX}px` : undefined,
          }}
        >
          {children}
        </div>
        {showCollapsed && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10"
            style={{
              background:
                "linear-gradient(to bottom, transparent, var(--collapse-fade, rgba(30,30,40,0.95)))",
            }}
            aria-hidden
          />
        )}
      </div>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`mt-1.5 text-xs font-medium ${toggleClass}`}
          aria-expanded={expanded}
          aria-controls={id}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
