type AuthMode = "login" | "register";

export function LoginModeToggle({
  mode,
  onChange,
}: {
  mode: AuthMode;
  onChange: (mode: AuthMode) => void;
}) {
  return (
    <div
      className="login-rise login-rise-1 flex rounded-[var(--radius-md)] border bg-[var(--panel-2)]/80 p-1"
      style={{ borderColor: "var(--border)" }}
      role="tablist"
      aria-label="Authentication mode"
    >
      {(
        [
          { id: "login" as const, label: "Sign in" },
          { id: "register" as const, label: "Create account" },
        ] as const
      ).map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={mode === id}
          data-active={mode === id}
          onClick={() => onChange(id)}
          className="login-mode-btn btn-interactive flex-1 rounded-[calc(var(--radius-md)-2px)] px-3 py-2 text-sm font-medium text-[var(--muted)] transition-[background,color,box-shadow] duration-200 hover:text-[var(--text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_srgb,var(--primary)_55%,transparent)]"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
