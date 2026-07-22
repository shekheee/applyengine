from __future__ import annotations

import html
import re
from typing import Any

from app.models import Job
from app.services.resume_a4 import A4_PAGE_CSS

VALID_TEMPLATE_STYLES = frozenset({"editorial", "executive"})


def _esc(value: Any) -> str:
    return html.escape(str(value or "").strip())


def _contact_line(doc: dict[str, Any]) -> str:
    parts = [
        _esc(doc.get("email")),
        _esc(doc.get("phone")),
        _esc(doc.get("location")),
    ]
    parts = [p for p in parts if p]
    for link in doc.get("links") or []:
        if link:
            parts.append(_esc(str(link)))
    return " · ".join(parts[:5])


def _role_headline(doc: dict[str, Any], job: Job | None) -> str:
    if job and job.title:
        return _esc(job.title)
    skills = doc.get("skills") or []
    if skills:
        top = ", ".join(_esc(str(s)) for s in skills[:3])
        return top
    return "Professional profile"


def _skills_html(skills: list[Any], *, compact: bool = False) -> str:
    items = [str(s).strip() for s in skills if str(s).strip()]
    if compact and len(items) > 18:
        items = items[:18]
    if not items:
        return ""
    chips = "".join(f'<span class="skill">{_esc(s)}</span>' for s in items)
    return f'<div class="skills">{chips}</div>'


def _experience_html(experience: list[Any], *, compact: bool = False) -> str:
    blocks: list[str] = []
    max_roles = 4 if compact else 6
    bullets_per = 3 if compact else 4
    for exp in (experience or [])[:max_roles]:
        if not isinstance(exp, dict):
            continue
        title = _esc(exp.get("title"))
        company = _esc(exp.get("company"))
        dates = _esc(exp.get("dates"))
        head = " — ".join(x for x in [title, company] if x)
        if not head:
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
                bullets = f"<ul>{lis}</ul>"
        date_html = f'<span class="dates">{dates}</span>' if dates else ""
        blocks.append(
            f'<article class="role"><div class="role-head">'
            f'<h3>{head}</h3>{date_html}</div>{bullets}</article>'
        )
    return "".join(blocks)


def _education_html(education: list[Any]) -> str:
    rows: list[str] = []
    for ed in education or []:
        if not isinstance(ed, dict):
            continue
        degree = _esc(ed.get("degree"))
        school = _esc(ed.get("school"))
        dates = _esc(ed.get("dates"))
        line = " — ".join(x for x in [degree, school] if x)
        if not line:
            continue
        suffix = f' <span class="dates">({dates})</span>' if dates else ""
        rows.append(f"<p class=\"edu-line\"><strong>{line}</strong>{suffix}</p>")
    return "".join(rows)


def _projects_html(projects: list[Any], *, compact: bool = False) -> str:
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
        blocks.append(f'<article class="role"><h3>{name}</h3><p class="proj-desc">{desc}</p></article>')
    return "".join(blocks)


def _base_styles(style: str, compact: bool) -> str:
    density = "compact" if compact else "normal"
    font_scale = "0.94" if compact else "1"
    return f"""
{A4_PAGE_CSS}
:root {{
  --accent: #1e3a5f;
  --accent-soft: #e8eef5;
  --text: #1a1f2e;
  --muted: #5c6578;
  --rule: #c5d0de;
  --chip-bg: #eef2f7;
  --chip-text: #243b53;
}}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{
  width: 210mm;
  min-height: 297mm;
  font-family: "Source Sans 3", "Segoe UI", system-ui, sans-serif;
  font-size: calc(10.5pt * {font_scale});
  line-height: 1.38;
  color: var(--text);
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}}
body.{density} {{ font-size: calc(10pt * {font_scale}); line-height: 1.32; }}
.page {{
  width: 210mm;
  min-height: 297mm;
  padding: 0;
  margin: 0 auto;
  background: #fff;
}}
h1 {{
  font-family: "Source Serif 4", Georgia, serif;
  font-size: calc(26pt * {font_scale});
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.05;
  color: var(--accent);
}}
.headline {{
  font-size: calc(10pt * {font_scale});
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  margin-top: 4px;
}}
.contact {{
  font-size: calc(9pt * {font_scale});
  color: var(--muted);
  margin-top: 8px;
}}
.contact a {{ color: var(--accent); text-decoration: none; }}
section {{ margin-top: calc(14px * {font_scale}); }}
h2 {{
  font-size: calc(9pt * {font_scale});
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent);
  border-bottom: 1.5px solid var(--rule);
  padding-bottom: 3px;
  margin-bottom: 8px;
}}
.summary {{
  font-size: calc(10pt * {font_scale});
  color: var(--text);
  line-height: 1.45;
}}
.skills {{
  display: flex;
  flex-wrap: wrap;
  gap: 5px 6px;
}}
.skill {{
  display: inline-block;
  background: var(--chip-bg);
  color: var(--chip-text);
  font-size: calc(8.5pt * {font_scale});
  font-weight: 500;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid #d8e0ea;
}}
.role {{ margin-bottom: calc(10px * {font_scale}); }}
.role-head {{
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}}
.role h3 {{
  font-size: calc(10.5pt * {font_scale});
  font-weight: 600;
  color: var(--text);
}}
.dates {{
  font-size: calc(8.5pt * {font_scale});
  color: var(--muted);
  white-space: nowrap;
}}
ul {{
  margin: 4px 0 0 0;
  padding-left: 16px;
}}
li {{
  font-size: calc(9.5pt * {font_scale});
  margin-bottom: 2px;
  color: var(--text);
}}
li::marker {{ color: var(--accent); }}
.edu-line {{
  font-size: calc(9.5pt * {font_scale});
  margin-bottom: 3px;
}}
.proj-desc {{ font-size: calc(9.5pt * {font_scale}); color: var(--muted); margin-top: 2px; }}
"""


def _editorial_html(doc: dict[str, Any], job: Job | None, compact: bool) -> str:
    name = _esc(doc.get("name") or "Candidate")
    contact = _contact_line(doc)
    headline = _role_headline(doc, job)
    summary = _esc(doc.get("summary"))
    skills = _skills_html(doc.get("skills") or [], compact=compact)
    experience = _experience_html(doc.get("experience") or [], compact=compact)
    projects = _projects_html(doc.get("projects") or [], compact=compact)
    education = _education_html(doc.get("education") or [])

    sections: list[str] = []
    if summary:
        sections.append(f'<section><h2>Profile</h2><p class="summary">{summary}</p></section>')
    if skills:
        sections.append(f'<section><h2>Core skills</h2>{skills}</section>')
    if experience:
        sections.append(f'<section><h2>Experience</h2>{experience}</section>')
    if projects:
        sections.append(f'<section><h2>Selected projects</h2>{projects}</section>')
    if education:
        sections.append(f'<section><h2>Education</h2>{education}</section>')

    density = "compact" if compact else "normal"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>{name} — Resume</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap" rel="stylesheet"/>
<style>
{_base_styles("editorial", compact)}
.header-band {{
  background: linear-gradient(135deg, var(--accent-soft) 0%, #fff 55%);
  border-bottom: 2px solid var(--accent);
  padding: 18px 16mm 14px;
  margin: 0 -16mm 0;
  width: calc(100% + 32mm);
}}
.content {{ padding: 0 16mm 14mm; }}
</style>
</head>
<body class="{density}">
<div class="page editorial">
  <header class="header-band">
    <h1>{name}</h1>
    <p class="headline">{headline}</p>
    {f'<p class="contact">{contact}</p>' if contact else ''}
  </header>
  <div class="content">
    {"".join(sections)}
  </div>
</div>
</body>
</html>"""


def _executive_html(doc: dict[str, Any], job: Job | None, compact: bool) -> str:
    name = _esc(doc.get("name") or "Candidate")
    contact = _contact_line(doc)
    headline = _role_headline(doc, job)
    summary = _esc(doc.get("summary"))
    skills = _skills_html(doc.get("skills") or [], compact=compact)
    experience = _experience_html(doc.get("experience") or [], compact=compact)
    education = _education_html(doc.get("education") or [])

    density = "compact" if compact else "normal"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>{name} — Resume</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap" rel="stylesheet"/>
<style>
{_base_styles("executive", compact)}
.layout {{
  display: grid;
  grid-template-columns: 30% 1fr;
  min-height: 297mm;
}}
.sidebar {{
  background: var(--accent);
  color: #f4f7fb;
  padding: 20px 14px 16px 16mm;
}}
.sidebar h1 {{
  color: #fff;
  font-size: calc(22pt * {"0.94" if compact else "1"});
  margin-bottom: 6px;
}}
.sidebar .headline {{
  color: #c8d9ec;
  font-size: calc(8.5pt * {"0.94" if compact else "1"});
  margin-bottom: 14px;
}}
.sidebar .contact {{
  color: #d0deef;
  font-size: calc(8.5pt * {"0.94" if compact else "1"});
  line-height: 1.5;
  margin-bottom: 16px;
}}
.sidebar h2 {{
  color: #fff;
  border-bottom-color: rgba(255,255,255,0.25);
  font-size: calc(8pt * {"0.94" if compact else "1"});
  margin-top: 14px;
}}
.sidebar .skill {{
  background: rgba(255,255,255,0.12);
  color: #fff;
  border-color: rgba(255,255,255,0.2);
  font-size: calc(8pt * {"0.94" if compact else "1"});
}}
.sidebar .edu-line {{
  color: #e2ebf5;
  font-size: calc(8.5pt * {"0.94" if compact else "1"});
}}
.sidebar .dates {{ color: #b8cce4; }}
.main {{
  padding: 20px 16mm 14px 18px;
}}
.main h2 {{ margin-top: 0; }}
.main .role h3 {{ font-size: calc(10pt * {"0.94" if compact else "1"}); }}
</style>
</head>
<body class="{density}">
<div class="page executive">
  <div class="layout">
    <aside class="sidebar">
      <h1>{name}</h1>
      <p class="headline">{headline}</p>
      {f'<p class="contact">{contact}</p>' if contact else ''}
      {f'<section><h2>Skills</h2>{skills}</section>' if skills else ''}
      {f'<section><h2>Education</h2>{education}</section>' if education else ''}
    </aside>
    <main class="main">
      {f'<section><h2>Summary</h2><p class="summary">{summary}</p></section>' if summary else ''}
      {f'<section><h2>Experience</h2>{experience}</section>' if experience else ''}
    </main>
  </div>
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
    """Render structured resume JSON into a hand-crafted A4 HTML template."""
    style_key = style if style in VALID_TEMPLATE_STYLES else "editorial"
    if style_key == "executive":
        return _executive_html(doc, job, compact)
    return _editorial_html(doc, job, compact)


def design_and_render_resume(
    doc: dict[str, Any],
    *,
    style: str = "editorial",
    job: Job | None = None,
) -> str:
    """Primary design path: template render (preview ≈ PDF)."""
    return render_resume_template(doc, style=style, job=job, compact=False)
