"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { LoginAuthForm } from "@/components/login/login-auth-form";
import { LoginBrandPanel } from "@/components/login/login-brand-panel";
import { LoginMobileHeader } from "@/components/login/login-mobile-header";
import { LoginStyles } from "@/components/login/login-styles";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <LoginStyles />
      <div className="grid min-h-[calc(100dvh-0px)] min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(420px,480px)] xl:grid-cols-[minmax(0,1fr)_520px]">
        <LoginBrandPanel />

        <section
          className="flex min-w-0 items-center justify-center px-4 py-10 sm:px-8 sm:py-12 lg:px-10 lg:py-16"
          aria-label="Sign in"
        >
          <div className="w-full min-w-0 max-w-[400px]">
            <LoginMobileHeader />
            <LoginAuthForm
              email={email}
              onEmailChange={setEmail}
              password={password}
              onPasswordChange={setPassword}
              error={error}
              busy={busy}
              onSubmit={submit}
            />
          </div>
        </section>
      </div>
    </>
  );
}
