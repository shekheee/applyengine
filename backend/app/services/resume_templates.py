from __future__ import annotations

import html
import re
from typing import Any

from app.models import Job
from app.services.resume_a4 import A4_PAGE_CSS

VALID_TEMPLATE_STYLES = frozenset({"editorial", "executive", "minimal"})


def _esc(value: Any) -> str:
    return html.escape(str(value or "").strip())


def _role_headline(doc: dict[str, Any], job: Job | None) -> str:
    if job and job.title:
        return _esc(job.title)
    skills = doc.get("skills") or []
    if skills:
        return _esc(" · ".join(str(s) for s in skills[:4]))
    return "Professional profile"


def _contact_items(doc: dict[str, Any], *, variant: str = "inline") -> str:
    rows: list[str] = []
    mapping = [
        ("email", doc.get("email")),
        ("phone", doc.get("phone")),
        ("location", doc.get("location")),
    ]
    for label, val in mapping:
        if val:
            rows.append(
                f'<span class="contact-item"><span class="contact-k">{label.title()}</span>'
                f'<span class="contact-v">{_esc(val)}</span></span>'
            )
    for link in (doc.get("links") or [])[:2]:
        if link:
            rows.append(
                f'<span class="contact-item"><span class="contact-k">Link</span>'
                f'<span class="contact-v">{_esc(str(link))}</span></span>'
            )
    if not rows:
        return ""
    joiner = "\n" if variant == "stack" else ""
    wrapper = "contact-stack" if variant == "stack" else "contact-row"
    return f'<div class="{wrapper}">{joiner.join(rows)}</div>'


def _skills_chips(skills: list[Any], *, compact: bool = False, max_items: int | None = None) -> str:
    items = [str(s).strip() for s in skills if str(s).strip()]
    limit = max_items or (16 if compact else 24)
    items = items[:limit]
    if not items:
        return ""
    return "".join(f'<span class="chip">{_esc(s)}</span>' for s in items)


def _skills_columns(skills: list[Any], *, cols: int = 3, compact: bool = False) -> str:
    items = [str(s).strip() for s in skills if str(s).strip()]
    limit = 18 if compact else 30
    items = items[:limit]
    if not items:
        return ""
    per = max(1, (len(items) + cols - 1) // cols)
    chunks = [items[i : i + per] for i in range(0, len(items), per)]
    col_html = "".join(
        f'<ul class="skill-col">{"".join(f"<li>{_esc(s)}</li>" for s in chunk)}</ul>'
        for chunk in chunks[:cols]
    )
    return f'<div class="skill-cols">{col_html}</div>'


def _experience_blocks(experience: list[Any], *, compact: bool = False) -> str:
    blocks: list[str] = []
    max_roles = 4 if compact else 5
    bullets_per = 3 if compact else 4
    for exp in (experience or [])[:max_roles]:
        if not isinstance(exp, dict):
            continue
        title = _esc(exp.get("title"))
        company = _esc(exp.get("company"))
        dates = _esc(exp.get("dates"))
        if not title and not company:
            continue
        highlights = exp.get("highlights") or []
        bullets = ""
        if highlights:
            lis = "".join(
                f"<li>{_esc(str(h))}</li>"
                for h in highlights[:bullets_per]
                if str(h).strip()
            )
            if lis:
                bullets = f'<ul class="bullets">{lis}</ul>'
        blocks.append(
            f"""<article class="role">
  <div class="role-top">
    <div class="role-ident">
      <p class="role-title">{title or company}</p>
      {f'<p class="role-org">{company}</p>' if title and company else ''}
    </div>
    {f'<time class="role-when">{dates}</time>' if dates else ''}
  </div>
  {bullets}
</article>"""
        )
    return "".join(blocks)


def _education_blocks(education: list[Any]) -> str:
    rows: list[str] = []
    for ed in education or []:
        if not isinstance(ed, dict):
            continue
        degree = _esc(ed.get("degree"))
        school = _esc(ed.get("school"))
        dates = _esc(ed.get("dates"))
        if not degree and not school:
            continue
        rows.append(
            f"""<div class="edu">
  <p class="edu-degree">{degree or school}</p>
  {f'<p class="edu-school">{school}</p>' if degree and school else ''}
  {f'<p class="edu-when">{dates}</p>' if dates else ''}
</div>"""
        )
    return "".join(rows)


def _projects_blocks(projects: list[Any], *, compact: bool = False) -> str:
    if compact:
        return ""
    blocks: list[str] = []
    for proj in (projects or [])[:2]:
        if not isinstance(proj, dict):
            continue
        name = _esc(proj.get("name"))
        desc = _esc(proj.get("description"))
        if not name:
            continue
        blocks.append(
            f'<article class="project"><p class="project-name">{name}</p>'
            f'{f"<p class=\"project-desc\">{desc}</p>" if desc else ""}</article>'
        )
    return "".join(blocks)


def _doc_sections(doc: dict[str, Any], job: Job | None, *, compact: bool) -> dict[str, str]:
    return {
        "name": _esc(doc.get("name") or "Candidate"),
        "headline": _role_headline(doc, job),
        "summary": _esc(doc.get("summary")),
        "contact_inline": _contact_items(doc, variant="inline"),
        "contact_stack": _contact_items(doc, variant="stack"),
        "skills_chips": _skills_chips(doc.get("skills") or [], compact=compact),
        "skills_cols": _skills_columns(doc.get("skills") or [], compact=compact),
        "experience": _experience_blocks(doc.get("experience") or [], compact=compact),
        "education": _education_blocks(doc.get("education") or []),
        "projects": _projects_blocks(doc.get("projects") or [], compact=compact),
    }


def _editorial_html(doc: dict[str, Any], job: Job | None, compact: bool) -> str:
    s = _doc_sections(doc, job, compact=compact)
    density = "compact" if compact else "normal"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>{s["name"]} — Resume</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>
{A4_PAGE_CSS}
:root {{
  --ink: #0f172a;
  --body: #334155;
  --muted: #64748b;
  --accent: #4f46e5;
  --accent-soft: #eef2ff;
  --rule: #e2e8f0;
  --chip: #f1f5f9;
}}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ width: 210mm; min-height: 297mm; background: #fff; color: var(--body);
  font-family: Inter, system-ui, sans-serif; font-size: {"9.6pt" if compact else "10.2pt"};
  line-height: 1.42; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.page {{ width: 210mm; min-height: 297mm; padding: 14mm 16mm 12mm; }}
.hero {{
  display: grid; grid-template-columns: 1fr auto; gap: 10mm; align-items: end;
  padding-bottom: 5mm; margin-bottom: 6mm;
  border-bottom: 2px solid var(--accent);
}}
.hero-main {{ min-width: 0; }}
.name {{
  font-family: Fraunces, Georgia, serif; font-size: {"26pt" if compact else "30pt"};
  font-weight: 600; letter-spacing: -0.03em; line-height: 1; color: var(--ink);
}}
.tagline {{
  margin-top: 3mm; font-size: {"9pt" if compact else "9.5pt"}; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent);
}}
.contact-row {{
  display: flex; flex-wrap: wrap; gap: 2mm 5mm; margin-top: 4mm;
  font-size: 8.5pt; color: var(--muted);
}}
.contact-item {{ display: inline-flex; gap: 1.5mm; align-items: baseline; }}
.contact-k {{ font-weight: 600; color: var(--ink); text-transform: uppercase; font-size: 7pt; letter-spacing: 0.08em; }}
.hero-badge {{
  writing-mode: vertical-rl; transform: rotate(180deg);
  font-size: 7pt; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase;
  color: var(--accent); opacity: 0.7;
}}
.section {{ margin-top: {"5mm" if compact else "6mm"}; }}
.section-head {{
  display: flex; align-items: center; gap: 3mm; margin-bottom: 3mm;
}}
.section-head::before {{
  content: ""; width: 3mm; height: 3mm; border-radius: 1px; background: var(--accent); flex-shrink: 0;
}}
.section-head h2 {{
  font-size: 8pt; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink);
}}
.section-head::after {{
  content: ""; flex: 1; height: 1px; background: var(--rule);
}}
.summary {{ color: var(--body); line-height: 1.48; max-width: 100%; }}
.chips {{ display: flex; flex-wrap: wrap; gap: 2mm; }}
.chip {{
  font-size: 8pt; font-weight: 500; padding: 1.2mm 3mm; border-radius: 999px;
  background: var(--chip); color: var(--ink); border: 1px solid #e2e8f0;
}}
.role {{ margin-bottom: {"4mm" if compact else "5mm"}; padding-bottom: {"3mm" if compact else "4mm"}; border-bottom: 1px solid #f1f5f9; }}
.role:last-child {{ border-bottom: none; }}
.role-top {{ display: flex; justify-content: space-between; align-items: flex-start; gap: 4mm; margin-bottom: 1.5mm; }}
.role-title {{ font-size: 10.5pt; font-weight: 700; color: var(--ink); line-height: 1.2; }}
.role-org {{ font-size: 9pt; font-weight: 500; color: var(--accent); margin-top: 0.5mm; }}
.role-when {{ font-size: 8pt; font-weight: 600; color: var(--muted); white-space: nowrap; padding-top: 1mm; }}
.bullets {{ margin: 1.5mm 0 0 4mm; padding: 0; }}
.bullets li {{ margin-bottom: 1mm; font-size: 9.5pt; color: var(--body); }}
.bullets li::marker {{ color: var(--accent); }}
.edu {{ margin-bottom: 2mm; }}
.edu-degree {{ font-weight: 600; color: var(--ink); font-size: 9.5pt; }}
.edu-school, .edu-when {{ font-size: 8.5pt; color: var(--muted); }}
.project {{ margin-bottom: 2mm; }}
.project-name {{ font-weight: 600; color: var(--ink); }}
.project-desc {{ font-size: 9pt; color: var(--muted); margin-top: 0.5mm; }}
</style>
</head>
<body class="{density}">
<div class="page editorial">
  <header class="hero">
    <div class="hero-main">
      <h1 class="name">{s["name"]}</h1>
      <p class="tagline">{s["headline"]}</p>
      {s["contact_inline"]}
    </div>
    <div class="hero-badge">Resume</div>
  </header>
  {f'<section class="section"><div class="section-head"><h2>Profile</h2></div><p class="summary">{s["summary"]}</p></section>' if s["summary"] else ""}
  {f'<section class="section"><div class="section-head"><h2>Expertise</h2></div><div class="chips">{s["skills_chips"]}</div></section>' if s["skills_chips"] else ""}
  {f'<section class="section"><div class="section-head"><h2>Experience</h2></div>{s["experience"]}</section>' if s["experience"] else ""}
  {f'<section class="section"><div class="section-head"><h2>Projects</h2></div>{s["projects"]}</section>' if s["projects"] else ""}
  {f'<section class="section"><div class="section-head"><h2>Education</h2></div>{s["education"]}</section>' if s["education"] else ""}
</div>
</body>
</html>"""


def _executive_html(doc: dict[str, Any], job: Job | None, compact: bool) -> str:
    s = _doc_sections(doc, job, compact=compact)
    density = "compact" if compact else "normal"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>{s["name"]} — Resume</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>
{A4_PAGE_CSS}
:root {{
  --sidebar: #0c4a4e;
  --sidebar-deep: #083344;
  --sidebar-text: #ecfeff;
  --sidebar-muted: #99f6e4;
  --ink: #0f172a;
  --body: #334155;
  --muted: #64748b;
  --accent: #0d9488;
  --rule: #e2e8f0;
}}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ width: 210mm; min-height: 297mm; background: #fff;
  font-family: "DM Sans", system-ui, sans-serif; font-size: {"9.4pt" if compact else "10pt"};
  line-height: 1.4; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.page {{ width: 210mm; min-height: 297mm; display: grid; grid-template-columns: 68mm 1fr; }}
.sidebar {{
  background: linear-gradient(165deg, var(--sidebar) 0%, var(--sidebar-deep) 100%);
  color: var(--sidebar-text); padding: 14mm 5mm 12mm 14mm;
}}
.sidebar .name {{
  font-family: "Cormorant Garamond", Georgia, serif;
  font-size: {"24pt" if compact else "28pt"}; font-weight: 600; line-height: 1.05;
  letter-spacing: -0.01em; color: #fff;
}}
.sidebar .tagline {{
  margin-top: 3mm; font-size: 7.5pt; font-weight: 600; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--sidebar-muted);
}}
.contact-stack {{ margin-top: 6mm; display: flex; flex-direction: column; gap: 2.5mm; }}
.contact-stack .contact-item {{ display: flex; flex-direction: column; gap: 0.5mm; }}
.contact-stack .contact-k {{ font-size: 6.5pt; font-weight: 700; letter-spacing: 0.14em;
  text-transform: uppercase; color: rgba(255,255,255,0.55); }}
.contact-stack .contact-v {{ font-size: 8pt; color: #fff; line-height: 1.35; word-break: break-word; }}
.side-section {{ margin-top: {"6mm" if compact else "8mm"}; }}
.side-section h2 {{
  font-size: 7pt; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase;
  color: rgba(255,255,255,0.5); padding-bottom: 2mm; margin-bottom: 3mm;
  border-bottom: 1px solid rgba(255,255,255,0.15);
}}
.chips {{ display: flex; flex-wrap: wrap; gap: 1.5mm; }}
.chip {{
  font-size: 7.2pt; font-weight: 500; padding: 1mm 2.5mm; border-radius: 4px;
  background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.12);
}}
.edu {{ margin-bottom: 2.5mm; }}
.edu-degree {{ font-size: 8.5pt; font-weight: 600; color: #fff; }}
.edu-school, .edu-when {{ font-size: 7.5pt; color: rgba(255,255,255,0.65); margin-top: 0.5mm; }}
.main {{ padding: 14mm 14mm 12mm 10mm; }}
.main .section {{ margin-bottom: {"5mm" if compact else "6mm"}; }}
.main h2 {{
  font-size: 8pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--accent); margin-bottom: 3mm; padding-bottom: 2mm; border-bottom: 2px solid var(--rule);
}}
.summary {{ color: var(--body); line-height: 1.5; }}
.role {{ margin-bottom: {"4mm" if compact else "5mm"}; }}
.role-top {{ display: flex; justify-content: space-between; gap: 4mm; align-items: flex-start; }}
.role-title {{ font-size: 10.5pt; font-weight: 700; color: var(--ink); }}
.role-org {{ font-size: 9pt; color: var(--accent); font-weight: 600; margin-top: 0.5mm; }}
.role-when {{ font-size: 8pt; font-weight: 600; color: var(--muted); white-space: nowrap; }}
.bullets {{ margin: 2mm 0 0 4mm; }}
.bullets li {{ margin-bottom: 1mm; font-size: 9.3pt; color: var(--body); }}
.bullets li::marker {{ color: var(--accent); }}
</style>
</head>
<body class="{density}">
<div class="page executive">
  <aside class="sidebar">
    <h1 class="name">{s["name"]}</h1>
    <p class="tagline">{s["headline"]}</p>
    {s["contact_stack"]}
    {f'<div class="side-section"><h2>Skills</h2><div class="chips">{s["skills_chips"]}</div></div>' if s["skills_chips"] else ""}
    {f'<div class="side-section"><h2>Education</h2>{s["education"]}</div>' if s["education"] else ""}
  </aside>
  <main class="main">
    {f'<section class="section"><h2>Summary</h2><p class="summary">{s["summary"]}</p></section>' if s["summary"] else ""}
    {f'<section class="section"><h2>Experience</h2>{s["experience"]}</section>' if s["experience"] else ""}
    {f'<section class="section"><h2>Projects</h2>{s["projects"]}</section>' if s["projects"] else ""}
  </main>
</div>
</body>
</html>"""


def _minimal_html(doc: dict[str, Any], job: Job | None, compact: bool) -> str:
    s = _doc_sections(doc, job, compact=compact)
    density = "compact" if compact else "normal"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>{s["name"]} — Resume</title>
<link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>
<style>
{A4_PAGE_CSS}
:root {{
  --ink: #18181b;
  --body: #3f3f46;
  --muted: #71717a;
  --accent: #b45309;
  --rule: #d4d4d8;
}}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ width: 210mm; min-height: 297mm; background: #fff; color: var(--body);
  font-family: "IBM Plex Sans", system-ui, sans-serif; font-size: {"9.5pt" if compact else "10pt"};
  line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.page {{ width: 210mm; min-height: 297mm; padding: 16mm 18mm 14mm; }}
.top {{ text-align: center; padding-bottom: 5mm; margin-bottom: 6mm; border-bottom: 1px solid var(--ink); }}
.name {{
  font-family: "Libre Baskerville", Georgia, serif; font-size: {"22pt" if compact else "26pt"};
  font-weight: 700; color: var(--ink); letter-spacing: -0.02em;
}}
.tagline {{
  margin-top: 2mm; font-size: 9pt; font-weight: 500; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--muted);
}}
.contact-row {{
  display: flex; flex-wrap: wrap; justify-content: center; gap: 1mm 4mm;
  margin-top: 3mm; font-size: 8pt; color: var(--muted);
}}
.contact-item {{ display: inline-flex; gap: 1mm; }}
.contact-k {{ display: none; }}
.contact-v::before {{ content: "· "; color: var(--rule); }}
.contact-item:first-child .contact-v::before {{ content: ""; }}
.section {{ margin-top: {"6mm" if compact else "7mm"}; }}
.section h2 {{
  font-family: "Libre Baskerville", Georgia, serif; font-size: 10pt; font-weight: 700;
  color: var(--ink); margin-bottom: 3mm; padding-bottom: 1.5mm;
  border-bottom: 2px solid var(--accent);
}}
.summary {{ max-width: 100%; line-height: 1.52; color: var(--body); }}
.skill-cols {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm 4mm; }}
.skill-col {{ list-style: none; padding: 0; margin: 0; }}
.skill-col li {{ font-size: 8.5pt; color: var(--body); margin-bottom: 1mm; padding-left: 2mm;
  border-left: 2px solid #f4f4f5; }}
.role {{ margin-bottom: {"4.5mm" if compact else "5.5mm"}; }}
.role-top {{ display: grid; grid-template-columns: 1fr auto; gap: 3mm; align-items: baseline; }}
.role-title {{ font-weight: 600; font-size: 10pt; color: var(--ink); }}
.role-org {{ font-size: 9pt; color: var(--muted); margin-top: 0.5mm; }}
.role-when {{ font-size: 8pt; font-weight: 500; color: var(--muted); }}
.bullets {{ margin: 2mm 0 0 5mm; }}
.bullets li {{ margin-bottom: 1.2mm; font-size: 9.3pt; }}
.edu {{ margin-bottom: 2mm; }}
.edu-degree {{ font-weight: 600; color: var(--ink); }}
.edu-school, .edu-when {{ font-size: 8.5pt; color: var(--muted); }}
</style>
</head>
<body class="{density}">
<div class="page minimal">
  <header class="top">
    <h1 class="name">{s["name"]}</h1>
    <p class="tagline">{s["headline"]}</p>
    {s["contact_inline"]}
  </header>
  {f'<section class="section"><h2>Profile</h2><p class="summary">{s["summary"]}</p></section>' if s["summary"] else ""}
  {f'<section class="section"><h2>Skills</h2>{s["skills_cols"]}</section>' if s["skills_cols"] else ""}
  {f'<section class="section"><h2>Experience</h2>{s["experience"]}</section>' if s["experience"] else ""}
  {f'<section class="section"><h2>Education</h2>{s["education"]}</section>' if s["education"] else ""}
</div>
</body>
</html>"""


def render_resume_template(
    doc: dict[str, Any],
    *,
    style: str = "editorial",
    job: Job | None = None,
    compact: bool = False,
) -> str:
    style_key = style if style in VALID_TEMPLATE_STYLES else "editorial"
    if style_key == "executive":
        return _executive_html(doc, job, compact)
    if style_key == "minimal":
        return _minimal_html(doc, job, compact)
    return _editorial_html(doc, job, compact)


def design_and_render_resume(
    doc: dict[str, Any],
    *,
    style: str = "editorial",
    job: Job | None = None,
) -> str:
    return render_resume_template(doc, style=style, job=job, compact=False)
