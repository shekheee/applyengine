import { Button, Input, Label } from "@/components/ui";
import { LoginErrorAlert } from "./login-error-alert";
import { LoginModeToggle } from "./login-mode-toggle";

type AuthMode = "login" | "register";

export function LoginAuthForm({
  mode,
  onModeChange,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  name,
  onNameChange,
  signupCode,
  onSignupCodeChange,
  error,
  busy,
  onSubmit,
}: {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  email: string;
  onEmailChange: (v: string) => void;
  password: string;
  onPasswordChange: (v: string) => void;
  name: string;
  onNameChange: (v: string) => void;
  signupCode: string;
  onSignupCodeChange: (v: string) => void;
  error: string;
  busy: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const errorId = error ? "login-error" : undefined;

  return (
    <div className="login-rise login-rise-1 w-full max-w-[400px]">
      <LoginModeToggle
        mode={mode}
        onChange={(next) => {
          onModeChange(next);
        }}
      />

      <div
        className="login-form-shell login-rise login-rise-2 mt-6 rounded-[var(--radius-xl)] border p-6 sm:p-8"
        style={{ borderColor: "var(--border-strong)" }}
      >
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--text)]">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            {mode === "login"
              ? "Sign in to continue your job search."
              : "Start tailoring applications in minutes."}
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="space-y-5"
          aria-busy={busy}
          noValidate={false}
        >
          {mode === "register" && (
            <div className="login-rise login-rise-3">
              <Label htmlFor="login-name">Name</Label>
              <Input
                id="login-name"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Ada Lovelace"
                autoComplete="name"
                aria-invalid={!!error}
                aria-describedby={errorId}
              />
            </div>
          )}

          <div className="login-rise login-rise-3">
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

          <div className="login-rise login-rise-4">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              aria-invalid={!!error}
              aria-describedby={errorId}
            />
          </div>

          {mode === "register" && (
            <div className="login-rise login-rise-4">
              <Label htmlFor="login-signup-code">
                Signup code{" "}
                <span className="font-normal text-[var(--muted-2)]">(if required)</span>
              </Label>
              <Input
                id="login-signup-code"
                value={signupCode}
                onChange={(e) => onSignupCodeChange(e.target.value)}
                placeholder="Invite code"
                aria-invalid={!!error}
                aria-describedby={errorId}
              />
            </div>
          )}

          {error && (
            <div id="login-error">
              <LoginErrorAlert message={error} />
            </div>
          )}

          <div className="login-rise login-rise-5 pt-1">
            <Button
              type="submit"
              variant="gradient"
              disabled={busy}
              className="w-full"
              size="lg"
            >
              {busy ? (
                <>
                  <svg
                    className="login-spinner h-4 w-4 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="3"
                    />
                    <path
                      className="opacity-90"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  <span>Please wait…</span>
                </>
              ) : mode === "login" ? (
                "Log in"
              ) : (
                "Create account"
              )}
            </Button>
          </div>
        </form>
      </div>

      <p className="login-rise login-rise-5 mt-6 text-center text-sm text-[var(--muted)]">
        {mode === "login" ? "New here?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => onModeChange(mode === "login" ? "register" : "login")}
          className="btn-interactive font-medium text-[var(--primary-2)] underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color-mix(in_srgb,var(--primary)_55%,transparent)]"
        >
          {mode === "login" ? "Create an account" : "Log in"}
        </button>
      </p>
    </div>
  );
}
