"""Offline eval harness for the ApplyEngine tailoring pipeline.

Metrics (all computed without a live server, using whichever LLM_PROVIDER is set;
defaults to the offline mock so this runs in CI with zero keys):

  - keyword_coverage_before : % of JD keywords present in the ORIGINAL resume
  - keyword_coverage_after  : % present AFTER tailoring
  - coverage_lift           : after - before  (the thing we actually optimize)
  - fit_score               : blended semantic + keyword score (0-100)
  - parse_ok                : did resume/JD parsing return usable structure

Run:  python evals/run_evals.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Make the backend package importable.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.services.generation import tailor_resume  # noqa: E402
from app.services.matching import compute_fit, keyword_coverage  # noqa: E402
from app.services.parsing import parse_job, parse_resume  # noqa: E402
from dataset import CASES  # noqa: E402


def run_case(case: dict) -> dict:
    profile = parse_resume(case["resume"])
    job = parse_job(case["jd"])
    keywords = job["keywords"]
    skills = profile["skills"]

    cov_before, _, _ = keyword_coverage(keywords, skills, case["resume"])

    fit = compute_fit(case["resume"], case["jd"], keywords, skills)

    tailored = tailor_resume(case["resume"], case["jd"], keywords)
    cov_after, _, _ = keyword_coverage(keywords, skills, tailored)

    return {
        "id": case["id"],
        "n_keywords": len(keywords),
        "keyword_coverage_before": round(cov_before, 3),
        "keyword_coverage_after": round(cov_after, 3),
        "coverage_lift": round(cov_after - cov_before, 3),
        "fit_score": fit["fit_score"],
        "parse_ok": bool(keywords) and bool(skills),
    }


def main() -> None:
    provider = os.getenv("LLM_PROVIDER", "mock")
    results = [run_case(c) for c in CASES]

    header = f"{'case':<18}{'kw':>4}{'cov_before':>12}{'cov_after':>11}{'lift':>8}{'fit':>7}{'parse':>7}"
    print(f"\nApplyEngine evals — provider={provider}\n")
    print(header)
    print("-" * len(header))
    for r in results:
        print(
            f"{r['id']:<18}{r['n_keywords']:>4}"
            f"{r['keyword_coverage_before']:>12}"
            f"{r['keyword_coverage_after']:>11}"
            f"{r['coverage_lift']:>+8.3f}"
            f"{r['fit_score']:>7}"
            f"{str(r['parse_ok']):>7}"
        )

    n = len(results)
    avg_lift = sum(r["coverage_lift"] for r in results) / n
    avg_fit = sum(r["fit_score"] for r in results) / n
    parse_rate = sum(r["parse_ok"] for r in results) / n
    print("-" * len(header))
    print(f"{'AVG':<18}{'':>4}{'':>12}{'':>11}{avg_lift:>+8.3f}{avg_fit:>7.1f}{parse_rate:>7.0%}")

    out = ROOT / "evals" / "results.json"
    out.write_text(json.dumps({"provider": provider, "cases": results}, indent=2))
    print(f"\nWrote {out.relative_to(ROOT)}")

    # Simple regression gates.
    assert parse_rate == 1.0, "Parsing failed on at least one case"
    assert avg_lift >= 0.0, "Tailoring reduced keyword coverage on average"
    print("All eval gates passed ✅")


if __name__ == "__main__":
    main()
