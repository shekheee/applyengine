import Image from "next/image";

export function LoginMobileHeader() {
  return (
    <div className="login-rise mb-8 flex flex-col items-center text-center lg:hidden">
      <span
        className="mb-4 grid h-11 w-11 place-items-center rounded-[var(--radius-md)] shadow-[0_8px_32px_-8px_var(--glow)] [background-image:var(--gradient-brand)]"
        aria-hidden
      >
        <Image src="/icons/spark.svg" alt="" width={22} height={22} />
      </span>
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
        ApplyEngine
      </p>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-[var(--muted)]">
        Your AI copilot for every application.
      </p>
    </div>
  );
}
