"use client";

import { useState } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/auth";
import { Button, Card, Input, Label } from "@/components/ui";

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-[calc(100dvh-0px)] lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--primary)]/25 via-transparent to-[var(--accent-teal)]/15" />
        <div className="relative">
          <div className="mb-8 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl [background-image:var(--gradient-brand)] shadow-[0_8px_32px_-8px_var(--glow)]">
              <Image src="/icons/spark.svg" alt="" width={22} height={22} />
            </span>
            <span className="text-xl font-semibold tracking-tight">ApplyEngine</span>
          </div>
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">
            Your AI copilot for every application.
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
            Tailored resumes, role-scoped coaching, interview practice, and a pipeline that
            keeps every opportunity organized — grounded in your real experience.
          </p>
        </div>
        <ul className="relative space-y-3 text-sm text-[var(--text-secondary)]">
          {[
            "Design Lab–quality resume artifacts",
            "JD-anchored Coach conversations",
            "Interview prep with actionable feedback",
          ].map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:text-left">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl [background-image:var(--gradient-brand)] shadow-lg lg:hidden">
              <Image src="/icons/spark.svg" alt="" width={24} height={24} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-1.5 text-sm text-[var(--muted)]">
              {mode === "login"
                ? "Sign in to continue your job search."
                : "Start tailoring applications in minutes."}
            </p>
          </div>

          <Card glass className="!p-6">
            <form onSubmit={submit} className="space-y-4">
              {mode === "register" && (
                <div>
                  <Label>Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ada Lovelace"
                    autoComplete="name"
                  />
                </div>
              )}
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
              <div>
                <Label>Password</Label>
                <Input
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
                  <Label>
                    Signup code <span className="font-normal text-[var(--muted-2)]">(if required)</span>
                  </Label>
                  <Input
                    value={signupCode}
                    onChange={(e) => setSignupCode(e.target.value)}
                    placeholder="Invite code"
                  />
                </div>
              )}

              {error && (
                <p className="rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
                  {error}
                </p>
              )}

              <Button type="submit" variant="gradient" disabled={busy} className="w-full" size="lg">
                {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-[var(--muted)]">
              {mode === "login" ? "New here?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError("");
                }}
                className="font-medium text-[var(--primary-2)] hover:underline"
              >
                {mode === "login" ? "Create an account" : "Log in"}
              </button>
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
