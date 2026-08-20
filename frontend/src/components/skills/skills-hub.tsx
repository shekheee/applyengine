"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { SkillDefinition } from "@/lib/types";
import { DocumentSkillIcon, PresentationSkillIcon, ResumeSkillIcon } from "./skill-icons";

const FALLBACK: SkillDefinition[] = [
  { id: "resume-builder", name: "Resume Builder", description: "Tailor, design, preview and export your one-page resume.", category: "Career documents", href: "/resume", output_formats: ["pdf", "docx"], status: "ready" },
  { id: "document-writer", name: "Document Writer", description: "Create grounded professional documents from your resume and target role.", category: "Professional writing", href: "/skills/documents", output_formats: ["docx", "pdf"], status: "ready" },
  { id: "presentation-builder", name: "Presentation Builder", description: "Build structured interview decks and role-specific plans.", category: "Presentations", href: "/skills/presentations", output_formats: ["pptx"], status: "ready" },
];

const LOOK = {
  "resume-builder": { index: "01", icon: ResumeSkillIcon, tone: "#2d6a78", wash: "rgba(45,106,120,.11)" },
  "document-writer": { index: "02", icon: DocumentSkillIcon, tone: "#775d9b", wash: "rgba(119,93,155,.11)" },
  "presentation-builder": { index: "03", icon: PresentationSkillIcon, tone: "#a65b3f", wash: "rgba(166,91,63,.11)" },
} as const;

export function SkillsHub() {
  const [skills, setSkills] = useState<SkillDefinition[]>(FALLBACK);

  useEffect(() => {
    api.listSkills().then(setSkills).catch(() => undefined);
  }, []);

  return (
    <div className="page-shell mx-auto max-w-[1480px] pb-12">
      <header className="border-b pb-8" style={{ borderColor: "var(--border)" }}>
        <p className="eyebrow">ApplyEngine Skills</p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
          <h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.035em] text-[var(--text)] sm:text-5xl">
            Turn career context into finished work.
          </h1>
          <p className="text-sm leading-6 text-[var(--muted)]">
            Each skill combines your verified base resume, an optional job description, specialist instructions and a reliable file renderer.
          </p>
        </div>
      </header>

      <div className="mt-8 divide-y border-y" style={{ borderColor: "var(--border)" }}>
        {skills.map((skill) => {
          const look = LOOK[skill.id as keyof typeof LOOK] ?? LOOK["document-writer"];
          const Icon = look.icon;
          return (
            <Link key={skill.id} href={skill.href} className="group grid gap-5 py-7 transition-colors hover:bg-[var(--panel)] sm:grid-cols-[72px_1fr_auto] sm:items-center sm:px-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl" style={{ color: look.tone, background: look.wash }}><Icon /></div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[10px] font-semibold tracking-[0.2em] text-[var(--muted-2)]">{look.index}</span>
                  <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--muted)]">{skill.category}</span>
                </div>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--text)] group-hover:text-[var(--primary-2)]">{skill.name}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">{skill.description}</p>
              </div>
              <div className="flex items-center gap-4 sm:justify-end">
                <div className="flex gap-1.5">{skill.output_formats.map((format) => <span key={format} className="rounded border px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]" style={{ borderColor: "var(--border)" }}>{format}</span>)}</div>
                <span className="text-xl text-[var(--muted)] transition-transform group-hover:translate-x-1 group-hover:text-[var(--text)]">→</span>
              </div>
            </Link>
          );
        })}
      </div>

      <section className="mt-10 grid gap-5 border-l-2 pl-5 sm:grid-cols-3" style={{ borderColor: "var(--primary)" }}>
        {[ ["Grounded", "Resume and JD context are treated as evidence, so the model is instructed not to invent claims."], ["Versioned", "Every generation and revision remains available in the workspace history."], ["Exportable", "Outputs are rendered into editable professional files instead of being trapped in chat."] ].map(([title, copy]) => <div key={title}><h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{copy}</p></div>)}
      </section>
    </div>
  );
}
