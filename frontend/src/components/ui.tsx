import Link from "next/link";
import type { ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
  interactive,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-[var(--panel)] p-5 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]",
        interactive && "card-interactive",
        className
      )}
      style={{ borderColor: "var(--border)" }}
    >
      {children}
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border bg-[var(--panel-2)]">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm text-[var(--muted)]">{description}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; icon?: ReactNode }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      className="inline-flex flex-wrap gap-1 rounded-xl border bg-[var(--panel)] p-1"
      style={{ borderColor: "var(--border)" }}
      role="tablist"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          data-active={active === tab.id}
          onClick={() => onChange(tab.id)}
          className="tab-pill inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--text)]"
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && (
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border bg-[var(--panel-2)]">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "ghost" | "outline";
  size?: "sm" | "md";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
};

export function Button({
  children,
  onClick,
  href,
  variant = "primary",
  size = "md",
  disabled,
  type = "button",
  className,
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2 text-sm" };
  const variants = {
    primary:
      "bg-[var(--primary)] text-white hover:bg-[var(--primary-2)] shadow-[0_4px_20px_-6px_var(--primary)]",
    ghost: "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--panel-2)]",
    outline:
      "border border-[var(--border)] text-[var(--text)] hover:bg-[var(--panel-2)]",
  };
  const cls = cn(base, sizes[size], variants[variant], className);
  if (href)
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "green" | "amber" | "red" | "primary";
}) {
  const tones: Record<string, string> = {
    default: "bg-[var(--panel-2)] text-[var(--muted)] border-[var(--border)]",
    green: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    amber: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    red: "bg-red-500/10 text-red-300 border-red-500/30",
    primary: "bg-violet-500/10 text-violet-300 border-violet-500/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

export function ScoreRing({ score }: { score: number | null }) {
  const value = score ?? 0;
  const tone =
    value >= 70 ? "var(--green)" : value >= 45 ? "var(--amber)" : "var(--red)";
  const deg = (value / 100) * 360;
  return (
    <div
      className="relative flex h-24 w-24 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(${tone} ${deg}deg, var(--panel-2) 0deg)`,
      }}
    >
      <div className="flex h-[76px] w-[76px] flex-col items-center justify-center rounded-full bg-[var(--panel)]">
        <span className="text-2xl font-semibold" style={{ color: tone }}>
          {score === null ? "–" : Math.round(value)}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
          fit
        </span>
      </div>
    </div>
  );
}

export function Textarea({
  value,
  onChange,
  placeholder,
  rows = 8,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full resize-y rounded-lg border bg-[var(--panel-2)] p-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]"
      style={{ borderColor: "var(--border)" }}
    />
  );
}
