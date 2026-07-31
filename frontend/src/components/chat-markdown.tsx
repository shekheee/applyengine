"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const WRAP =
  "min-w-0 max-w-full [overflow-wrap:anywhere] [word-break:break-word]";

type Density = "default" | "compact";

const DENSITY = {
  default: {
    p: "mb-3 last:mb-0 text-[15px] leading-[1.65] text-[var(--text-secondary)]",
    ul: "mb-3 list-disc space-y-1 pl-5 last:mb-0",
    ol: "mb-3 list-decimal space-y-1 pl-5 last:mb-0",
    li: "text-[15px] leading-[1.65] text-[var(--text-secondary)]",
    pre: "mb-3 max-w-full overflow-x-auto last:mb-0",
    codeBlock:
      "block max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-[#0d0d12] p-3 text-[13px] leading-relaxed text-[#e8e8f0] sm:whitespace-pre",
    h1: "mb-2 mt-4 text-lg font-semibold first:mt-0",
    h2: "mb-2 mt-3 text-base font-semibold first:mt-0",
    h3: "mb-1 mt-2 text-sm font-semibold first:mt-0",
    blockquote: "mb-3 border-l-2 pl-3 text-[var(--muted)] last:mb-0",
    tableWrap: "mb-3 max-w-full overflow-x-auto last:mb-0",
  },
  compact: {
    p: "mb-1.5 last:mb-0 text-[15px] leading-[1.48] text-[var(--text-secondary)]",
    ul: "mb-1.5 list-disc space-y-0 pl-[1.125rem] last:mb-0 [&_ul]:mt-0.5 [&_ul]:mb-0 [&_ol]:mt-0.5 [&_ol]:mb-0",
    ol: "mb-1.5 list-decimal space-y-0 pl-[1.125rem] last:mb-0 [&_ul]:mt-0.5 [&_ul]:mb-0 [&_ol]:mt-0.5 [&_ol]:mb-0",
    li: "text-[15px] leading-[1.48] text-[var(--text-secondary)] [&>p]:mb-1 [&>p:last-child]:mb-0",
    pre: "my-1.5 max-w-full overflow-x-auto last:mb-0",
    codeBlock:
      "block max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-[#0d0d12] px-2.5 py-2 text-[13px] leading-[1.45] text-[#e8e8f0] sm:whitespace-pre",
    h1: "mb-1 mt-2 text-base font-semibold first:mt-0",
    h2: "mb-1 mt-1.5 text-[15px] font-semibold first:mt-0",
    h3: "mb-0.5 mt-1 text-sm font-semibold first:mt-0",
    blockquote: "my-1.5 border-l-2 pl-2.5 text-[var(--muted)] last:mb-0",
    tableWrap: "my-1.5 max-w-full overflow-x-auto last:mb-0",
  },
} as const;

export function ChatMarkdown({
  content,
  density = "default",
}: {
  content: string;
  density?: Density;
}) {
  const d = DENSITY[density];

  return (
    <div className={WRAP}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className={d.p}>{children}</p>,
          ul: ({ children }) => <ul className={d.ul}>{children}</ul>,
          ol: ({ children }) => <ol className={d.ol}>{children}</ol>,
          li: ({ children }) => <li className={d.li}>{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-[var(--text)]">{children}</strong>
          ),
          code: ({ className, children }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return <code className={d.codeBlock}>{children}</code>;
            }
            return (
              <code className="break-words rounded bg-[#0d0d12] px-1 py-0.5 text-[13px] leading-[1.4] text-[var(--primary-2)]">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className={d.pre}>{children}</pre>,
          h1: ({ children }) => <h1 className={d.h1}>{children}</h1>,
          h2: ({ children }) => <h2 className={d.h2}>{children}</h2>,
          h3: ({ children }) => <h3 className={d.h3}>{children}</h3>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="break-words text-[var(--primary-2)] underline underline-offset-2 hover:text-[var(--primary)]"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className={d.tableWrap}>
              <table className="min-w-full border-collapse text-left text-sm leading-[1.45]">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th
              className="border px-1.5 py-0.5 text-[13px] font-semibold leading-[1.45]"
              style={{ borderColor: "var(--border)" }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              className="border px-1.5 py-0.5 text-[13px] leading-[1.45]"
              style={{ borderColor: "var(--border)" }}
            >
              {children}
            </td>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className={d.blockquote}
              style={{ borderColor: "var(--primary)" }}
            >
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
