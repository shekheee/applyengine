import Link from "next/link";
import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes } from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ─── Card ─── */
export function Card({
  children,
  className,
  interactive,
  glass,
  gradient,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  glass?: boolean;
  gradient?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] border p-5",
        glass ? "glass-panel" : gradient ? "surface-gradient" : "bg-[var(--panel)]",
        !glass && !gradient && "shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]",
        interactive && "card-interactive",
        className
      )}
      style={{ borderColor: glass ? undefined : "var(--border)" }}
    >
      {children}
    </div>
  );
}

/* ─── Page header ─── */
export function PageHeader({
  title,
  description,
  action,
  badge,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {badge && <div className="mb-2">{badge}</div>}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            {description}
          </p>
        )}
      </div>
      {action}
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
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border bg-[var(--panel-2)] shadow-sm">
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

/* ─── Stat card ─── */
export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "primary" | "green" | "amber" | "default";
}) {
  const accentClass = {
    primary: "from-[var(--primary)]/20 to-transparent",
    green: "from-emerald-500/20 to-transparent",
    amber: "from-amber-500/20 to-transparent",
    default: "from-white/5 to-transparent",
  }[accent ?? "default"];

  return (
    <Card className={cn("relative overflow-hidden p-4", "card-interactive")}>
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80",
          accentClass
        )}
      />
      <div className="relative">
        <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-[var(--muted-2)]">{hint}</p>}
      </div>
    </Card>
  );
}

/* ─── Tabs ─── */
export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: { id: T; label: string; icon?: ReactNode }[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex flex-wrap gap-1 rounded-[var(--radius-lg)] border bg-[var(--panel)]/80 p-1 backdrop-blur-sm",
        className
      )}
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
          className="tab-pill btn-interactive inline-flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--text)]"
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Empty / Skeleton ─── */
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
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && (
        <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl border bg-[var(--panel-2)] shadow-[0_0_40px_-10px_var(--glow-soft)]">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="page-enter space-y-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

/* ─── Form primitives ─── */
export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
      {children}
    </label>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  return (
    <input
      className={cn(
        "input-field w-full rounded-[var(--radius-md)] border bg-[var(--panel-2)] px-3 py-2.5 text-sm text-[var(--text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--muted-2)]",
        className
      )}
      style={{ borderColor: "var(--border)" }}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { className?: string }) {
  return (
    <select
      className={cn(
        "input-field w-full rounded-[var(--radius-md)] border bg-[var(--panel-2)] px-3 py-2.5 text-sm text-[var(--text)] outline-none transition-[border-color,box-shadow]",
        className
      )}
      style={{ borderColor: "var(--border)" }}
      {...props}
    >
      {children}
    </select>
  );
}

/* ─── Button ─── */
type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "ghost" | "outline" | "gradient";
  size?: "sm" | "md" | "lg";
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
    "btn-interactive inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-medium disabled:cursor-not-allowed disabled:opacity-50";
  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2.5 text-sm",
    lg: "px-5 py-3 text-base",
  };
  const variants = {
    primary:
      "bg-[var(--primary)] text-white shadow-[0_4px_24px_-6px_var(--glow)] hover:bg-[var(--primary-2)]",
    gradient:
      "bg-[length:200%_200%] text-white shadow-[0_4px_24px_-6px_var(--glow)] hover:opacity-95 [background-image:var(--gradient-brand)]",
    ghost:
      "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]",
    outline:
      "border text-[var(--text)] hover:bg-[var(--panel-2)]",
  };
  const cls = cn(base, sizes[size], variants[variant], className);
  const borderStyle = variant === "outline" ? { borderColor: "var(--border)" } : undefined;

  if (href)
    return (
      <Link href={href} className={cls} style={borderStyle}>
        {children}
      </Link>
    );
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls} style={borderStyle}>
      {children}
    </button>
  );
}

/* ─── Badge ─── */
export function Badge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "green" | "amber" | "red" | "primary";
}) {
  const tones: Record<string, string> = {
    default: "bg-[var(--panel-2)] text-[var(--muted)] border-[var(--border)]",
    green: "bg-emerald-500/12 text-emerald-300 border-emerald-500/25",
    amber: "bg-amber-500/12 text-amber-300 border-amber-500/25",
    red: "bg-red-500/12 text-red-300 border-red-500/25",
    primary: "bg-violet-500/12 text-violet-200 border-violet-500/25",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

/* ─── Score ring ─── */
export function ScoreRing({ score }: { score: number | null }) {
  const value = score ?? 0;
  const tone =
    value >= 70 ? "var(--green)" : value >= 45 ? "var(--amber)" : "var(--red)";
  const deg = (value / 100) * 360;
  return (
    <div
      className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full shadow-[0_0_30px_-8px_var(--glow-soft)]"
      style={{
        background: `conic-gradient(${tone} ${deg}deg, var(--panel-3) 0deg)`,
      }}
    >
      <div className="flex h-[76px] w-[76px] flex-col items-center justify-center rounded-full bg-[var(--panel)] ring-1 ring-[var(--border)]">
        <span className="text-2xl font-semibold tabular-nums" style={{ color: tone }}>
          {score === null ? "–" : Math.round(value)}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
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
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={cn(
        "input-field w-full resize-y rounded-[var(--radius-md)] border bg-[var(--panel-2)] p-3 text-sm text-[var(--text)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--muted-2)]",
        className
      )}
      style={{ borderColor: "var(--border)" }}
    />
  );
}
