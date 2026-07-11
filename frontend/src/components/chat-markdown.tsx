"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const WRAP =
  "min-w-0 max-w-full [overflow-wrap:anywhere] [word-break:break-word]";

export function ChatMarkdown({ content }: { content: string }) {
  return (
    <div className={WRAP}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-[var(--text)]">{children}</strong>
          ),
          code: ({ className, children }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <code className="block max-w-full overflow-x-auto whitespace-pre rounded-lg bg-[#0d0d12] p-3 text-[13px] leading-relaxed text-[#e8e8f0]">
                  {children}
                </code>
              );
            }
            return (
              <code className="break-words rounded bg-[#0d0d12] px-1.5 py-0.5 text-[13px] text-[var(--primary-2)]">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-3 max-w-full overflow-x-auto last:mb-0">{children}</pre>
          ),
          h1: ({ children }) => (
            <h1 className="mb-2 mt-4 text-lg font-semibold first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-3 text-base font-semibold first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h3>
          ),
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
            <div className="mb-3 max-w-full overflow-x-auto last:mb-0">
              <table className="min-w-full border-collapse text-left text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th
              className="border px-2 py-1 font-semibold"
              style={{ borderColor: "var(--border)" }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border px-2 py-1" style={{ borderColor: "var(--border)" }}>
              {children}
            </td>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className="mb-3 border-l-2 pl-3 text-[var(--muted)] last:mb-0"
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
