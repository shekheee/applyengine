import { Button, Input, Label } from "@/components/ui";
import { LoginErrorAlert } from "./login-error-alert";

export function LoginAuthForm({
  email,
  onEmailChange,
  password,
  onPasswordChange,
  error,
  busy,
  onSubmit,
}: {
  email: string;
  onEmailChange: (v: string) => void;
  password: string;
  onPasswordChange: (v: string) => void;
  error: string;
  busy: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const errorId = error ? "login-error" : undefined;

  return (
    <div className="login-rise login-rise-1 w-full max-w-[400px]">
      <div
        className="login-form-shell rounded-[var(--radius-xl)] border p-6 sm:p-8"
        style={{ borderColor: "var(--border-strong)" }}
      >
        <header className="mb-8">
          <p className="mb-3 text-sm font-medium text-[var(--primary-2)]">Private workspace</p>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text)]">
            Welcome back
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            Sign in to continue managing applications and interview practice.
          </p>
        </header>

        <form onSubmit={onSubmit} className="space-y-5" aria-busy={busy}>
          <div>
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              aria-invalid={!!error}
              aria-describedby={errorId}
            />
          </div>

          <div>
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              aria-invalid={!!error}
              aria-describedby={errorId}
            />
          </div>

          {error && (
            <div id="login-error">
              <LoginErrorAlert message={error} />
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={busy}
            className="w-full"
            size="lg"
          >
            {busy ? "Signing in…" : "Log in"}
          </Button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        Authorised users only
      </p>
    </div>
  );
}
