import Image from "next/image";

const FEATURES = [
  {
    icon: "/icons/resume.svg",
    title: "Design Lab resumes",
    description: "Artifacts tuned to each role, not generic templates.",
  },
  {
    icon: "/icons/chat.svg",
    title: "JD-anchored Coach",
    description: "Conversations grounded in the job and your profile.",
  },
  {
    icon: "/icons/interview.svg",
    title: "Interview prep",
    description: "Practice with feedback you can act on immediately.",
  },
] as const;

export function LoginBrandPanel() {
  return (
    <aside
      className="relative hidden min-h-full flex-col justify-between overflow-hidden border-r lg:flex"
      style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
      aria-label="ApplyEngine overview"
    >
      {/* Ambient depth — layered orbs + grid, not flat glass */}
      <div className="login-grid-bg pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div
        className="login-orb pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full blur-[100px]"
        style={{ background: "color-mix(in srgb, var(--primary) 35%, transparent)" }}
        aria-hidden
      />
      <div
        className="login-orb login-orb-delay pointer-events-none absolute -right-16 bottom-1/4 h-64 w-64 rounded-full blur-[90px]"
        style={{ background: "color-mix(in srgb, var(--accent-teal) 22%, transparent)" }}
        aria-hidden
      />

      <div className="relative flex flex-1 flex-col justify-between p-10 xl:p-12">
        {/* Brand lockup */}
        <div className="login-rise">
          <div className="flex items-center gap-3">
            <span
              className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] shadow-[0_8px_32px_-8px_var(--glow)] [background-image:var(--gradient-brand)]"
              aria-hidden
            >
              <Image src="/icons/spark.svg" alt="" width={20} height={20} />
            </span>
            <span className="text-lg font-semibold tracking-tight text-[var(--text)]">
              ApplyEngine
            </span>
          </div>
        </div>

        {/* Editorial headline — typographic hierarchy */}
        <div className="login-rise login-rise-1 my-12 max-w-lg">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
            AI job search workspace
          </p>
          <h2 className="text-[2rem] font-semibold leading-[1.12] tracking-[-0.03em] text-[var(--text)] xl:text-[2.75rem]">
            Every application,{" "}
            <span className="bg-[length:200%_auto] bg-clip-text text-transparent [background-image:var(--gradient-brand)]">
              precisely tailored.
            </span>
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-[var(--text-secondary)]">
            Resumes, coaching, and interview prep in one pipeline — grounded in your real
            experience, not generic AI output.
          </p>
        </div>

        {/* Feature cards — restrained elevation */}
        <ul className="login-rise login-rise-2 space-y-3" aria-label="Product highlights">
          {FEATURES.map(({ icon, title, description }) => (
            <li
              key={title}
              className="flex items-start gap-4 rounded-[var(--radius-lg)] border bg-[var(--panel)]/60 px-4 py-4 backdrop-blur-sm transition-[border-color,background] duration-200 hover:border-[color-mix(in_srgb,var(--primary)_30%,var(--border))]"
              style={{ borderColor: "var(--border)" }}
            >
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] border bg-[var(--panel-2)]"
                style={{ borderColor: "var(--border)" }}
                aria-hidden
              >
                <Image src={icon} alt="" width={18} height={18} />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-sm font-medium text-[var(--text)]">{title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-[var(--muted)]">{description}</p>
              </div>
            </li>
          ))}
        </ul>

        {/* Trust footer */}
        <p className="login-rise login-rise-3 mt-10 text-xs text-[var(--muted-2)]">
          Trusted by candidates who treat every application as a product launch.
        </p>
      </div>
    </aside>
  );
}
