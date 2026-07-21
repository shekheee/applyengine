from __future__ import annotations

import io
import logging
import re

logger = logging.getLogger(__name__)

# Progressive fit levels — CSS tightening then content trimming (no fabrication).
_FIT_LEVELS: list[dict] = [
    {"css": ""},
    {
        "css": """
body { font-size: 9.5pt !important; line-height: 1.28 !important; }
h1 { font-size: 17pt !important; margin-bottom: 2px !important; }
h2 { font-size: 10pt !important; margin: 7px 0 3px !important; padding-bottom: 1px !important; }
h3, .role-title { font-size: 9.5pt !important; margin: 4px 0 1px !important; }
p, li { font-size: 9pt !important; margin-bottom: 1px !important; }
section { margin-bottom: 5px !important; }
ul { margin: 1px 0 3px 16px !important; padding: 0 !important; }
@page { size: letter; margin: 0.45in; }
""",
    },
    {
        "css": """
body { font-size: 9pt !important; line-height: 1.22 !important; }
h1 { font-size: 16pt !important; }
h2 { font-size: 9.5pt !important; margin: 5px 0 2px !important; }
h3, .role-title { font-size: 9pt !important; }
p, li { font-size: 8.5pt !important; line-height: 1.2 !important; }
section { margin-bottom: 4px !important; }
@page { size: letter; margin: 0.4in; }
""",
        "bullets_per_list": 4,
        "summary_words": 45,
    },
    {
        "css": """
body { font-size: 8.5pt !important; line-height: 1.18 !important; }
h1 { font-size: 15pt !important; }
h2 { font-size: 9pt !important; margin: 4px 0 2px !important; }
h3, .role-title { font-size: 8.5pt !important; }
p, li { font-size: 8pt !important; }
@page { size: letter; margin: 0.35in; }
""",
        "bullets_per_list": 3,
        "max_roles": 4,
        "summary_words": 38,
    },
    {
        "css": """
body { font-size: 8pt !important; line-height: 1.15 !important; }
h1 { font-size: 14pt !important; }
h2, h3 { font-size: 8.5pt !important; }
p, li { font-size: 7.5pt !important; }
@page { size: letter; margin: 0.3in; }
""",
        "bullets_per_list": 2,
        "max_roles": 3,
        "summary_words": 30,
        "hide_projects": True,
    },
    {
        "css": """
body { font-size: 7.5pt !important; line-height: 1.12 !important; }
h1 { font-size: 13pt !important; }
h2, h3 { font-size: 8pt !important; }
p, li { font-size: 7pt !important; }
@page { size: letter; margin: 0.28in; }
""",
        "bullets_per_list": 2,
        "max_roles": 2,
        "summary_words": 24,
        "hide_projects": True,
        "max_skills": 14,
    },
    {
        "css": """
body { font-size: 7pt !important; line-height: 1.1 !important; }
h1 { font-size: 12pt !important; }
h2, h3 { font-size: 7.5pt !important; }
p, li { font-size: 6.8pt !important; }
@page { size: letter; margin: 0.25in; }
""",
        "bullets_per_list": 1,
        "max_roles": 2,
        "summary_words": 18,
        "hide_projects": True,
        "hide_education": True,
        "max_skills": 10,
    },
]


def _inject_css(html: str, css: str) -> str:
    if not css.strip():
        return html
    block = f"\n/* one-page fit */\n{css}\n"
    if re.search(r"</style>", html, re.IGNORECASE):
        return re.sub(r"</style>", block + "</style>", html, count=1, flags=re.IGNORECASE)
    return re.sub(
        r"</head>",
        f"<style>{block}</style></head>",
        html,
        count=1,
        flags=re.IGNORECASE,
    )


def _trim_summary(html: str, max_words: int) -> str:
    def trim_p(match: re.Match) -> str:
        tag = match.group(1)
        text = re.sub(r"<[^>]+>", " ", match.group(2))
        words = text.split()
        if len(words) <= max_words:
            return match.group(0)
        trimmed = " ".join(words[:max_words]).strip()
        if trimmed and not trimmed.endswith("."):
            trimmed += "…"
        return f"{tag}{trimmed}</p>"

    # Summary section paragraphs
    html = re.sub(
        r"(<section[^>]*>\s*<h2[^>]*>\s*summary\s*</h2>\s*<p[^>]*>)(.*?)(</p>)",
        lambda m: m.group(1)
        + " ".join(
            re.sub(r"<[^>]+>", " ", m.group(2)).split()[:max_words]
        ).strip()
        + ("…" if len(re.sub(r"<[^>]+>", " ", m.group(2)).split()) > max_words else "")
        + m.group(3),
        html,
        count=1,
        flags=re.IGNORECASE | re.DOTALL,
    )
    return html


def _limit_list_items(html: str, max_items: int) -> str:
    def limit_ul(match: re.Match) -> str:
        opening, inner, closing = match.group(1), match.group(2), match.group(3)
        items = re.findall(r"<li[^>]*>.*?</li>", inner, flags=re.DOTALL | re.IGNORECASE)
        if len(items) <= max_items:
            return match.group(0)
        return opening + "".join(items[:max_items]) + closing

    return re.sub(
        r"(<ul[^>]*>)(.*?)(</ul>)",
        limit_ul,
        html,
        flags=re.DOTALL | re.IGNORECASE,
    )


def _limit_experience_blocks(html: str, max_roles: int) -> str:
    """Keep the first N role blocks inside Experience (article, div.role, or h3 groups)."""
    exp_match = re.search(
        r"(<section[^>]*>)(\s*<h2[^>]*>\s*experience\s*</h2>)(.*?)(</section>)",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not exp_match:
        return html

    prefix, heading, body, suffix = exp_match.groups()
    articles = re.findall(
        r"<article[^>]*>.*?</article>",
        body,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if articles:
        trimmed = heading + "".join(articles[:max_roles])
        return html[: exp_match.start()] + prefix + trimmed + suffix + html[exp_match.end() :]

    # Fallback: split on h3 role headers
    parts = re.split(r"(<h3[^>]*>.*?</h3>)", body, flags=re.DOTALL | re.IGNORECASE)
    if len(parts) <= 1:
        return html
    kept = [parts[0]]
    role_count = 0
    i = 1
    while i < len(parts):
        if role_count >= max_roles:
            break
        kept.append(parts[i])
        if i + 1 < len(parts):
            kept.append(parts[i + 1])
        role_count += 1
        i += 2
    trimmed = heading + "".join(kept)
    return html[: exp_match.start()] + prefix + trimmed + suffix + html[exp_match.end() :]


def _hide_section(html: str, keyword: str) -> str:
    return re.sub(
        rf"<section[^>]*>\s*<h2[^>]*>\s*{keyword}[^<]*</h2>.*?</section>",
        "",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )


def _limit_skills(html: str, max_skills: int) -> str:
    def trim_skills_section(match: re.Match) -> str:
        opening, heading, body, closing = (
            match.group(1),
            match.group(2),
            match.group(3),
            match.group(4),
        )
        text = re.sub(r"<[^>]+>", " ", body)
        parts = [p.strip() for p in re.split(r"[,·|/]", text) if p.strip()]
        if len(parts) <= max_skills:
            return match.group(0)
        trimmed = ", ".join(parts[:max_skills])
        return opening + heading + f"<p>{trimmed}</p>" + closing

    return re.sub(
        r"(<section[^>]*>)(\s*<h2[^>]*>\s*skills\s*</h2>)(.*?)(</section>)",
        trim_skills_section,
        html,
        count=1,
        flags=re.IGNORECASE | re.DOTALL,
    )


def condense_html(html: str, level: int) -> str:
    """Apply progressive CSS/content condensation for one-page fit."""
    idx = min(level, len(_FIT_LEVELS) - 1)
    cfg = _FIT_LEVELS[idx]
    out = _inject_css(html, cfg.get("css", ""))
    if cfg.get("summary_words"):
        out = _trim_summary(out, int(cfg["summary_words"]))
    if cfg.get("bullets_per_list"):
        out = _limit_list_items(out, int(cfg["bullets_per_list"]))
    if cfg.get("max_roles"):
        out = _limit_experience_blocks(out, int(cfg["max_roles"]))
    if cfg.get("hide_projects"):
        out = _hide_section(out, "project")
    if cfg.get("hide_education"):
        out = _hide_section(out, "education")
    if cfg.get("max_skills"):
        out = _limit_skills(out, int(cfg["max_skills"]))
    return out


def pdf_page_count(pdf_bytes: bytes) -> int:
    from pypdf import PdfReader

    return len(PdfReader(io.BytesIO(pdf_bytes)).pages)
