"use client";

import { useState } from "react";
import { ChatMarkdown } from "@/components/chat-markdown";

/** Renders markdown in a panel; optionally collapsible. */
export function MarkdownPanel({
  markdown,
  title,
  collapsible = false,
  defaultOpen = true,
}: {
  markdown: string;
  title?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const body = <ChatMarkdown content={markdown} density="compact" />;

  return (
    <section
      className="rounded-[var(--radius-lg)] border bg-[var(--panel)] p-5"
      style={{ borderColor: "var(--border)" }}
    >
      {title &&
        (collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex w-full items-center justify-between text-left text-sm font-semibold text-[var(--text)]"
          >
            {title}
            <span className="text-xs font-medium text-[var(--muted)]">
              {open ? "Hide" : "Show"}
            </span>
          </button>
        ) : (
          <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
        ))}
      {(!collapsible || open) && <div className={title ? "mt-3" : undefined}>{body}</div>}
    </section>
  );
}
