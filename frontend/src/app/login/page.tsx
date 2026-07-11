"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button, Card } from "@/components/ui";

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register({ email, password, name, signup_code: signupCode });
      }
      // Redirect handled by the Gate once user is set.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--primary)]";

  return (
    <div className="mx-auto max-w-md pt-8">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-[var(--primary)] text-2xl text-white">
          ⚡
        </div>
        <h1 className="text-2xl font-semibold">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Your AI career copilot — tailored to your resume and target roles.
        </p>
      </div>

      <Card>
        <form onSubmit={submit} className="space-y-3">
          {mode === "register" && (
            <div>
              <label className="mb-1 block text-xs text-[var(--muted)]">Name</label>
              <input
                className={field}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                autoComplete="name"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-[var(--muted)]">Email</label>
            <input
              className={field}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--muted)]">Password</label>
            <input
              className={field}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </div>
          {mode === "register" && (
            <div>
              <label className="mb-1 block text-xs text-[var(--muted)]">
                Signup code{" "}
                <span className="text-[var(--muted)]">(if required)</span>
              </label>
              <input
                className={field}
                value={signupCode}
                onChange={(e) => setSignupCode(e.target.value)}
                placeholder="Invite code"
              />
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy} className="w-full">
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Log in"
                : "Create account"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-[var(--muted)]">
          {mode === "login" ? "New here?" : "Already have an account?"}{" "}
          <button
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
            className="font-medium text-[var(--primary)] hover:underline"
          >
            {mode === "login" ? "Create an account" : "Log in"}
          </button>
        </p>
      </Card>
    </div>
  );
}
