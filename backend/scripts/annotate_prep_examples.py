"""Write each visible test case's `expected` Output from the reference solution.

Run from backend/ after adding or editing prep content:
    python scripts/annotate_prep_examples.py
tests/test_prep_content.py fails until examples match their solution again.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tests.test_prep_content import (  # noqa: E402
    CONTENT_DIR,
    TRACKS_DIR,
    example_output,
    run_cases,
    solution_code,
)


def annotate(entry: dict) -> int:
    groups = [lvl["tests"] for lvl in entry.get("levels") or []] or [entry.get("tests") or []]
    if not any(groups):
        return 0
    code = solution_code(entry)
    changed = 0
    cumulative: list[dict] = []
    for group in groups:
        cumulative += group
        outcomes = {name: records for name, _, records in run_cases(code, cumulative)}
        for test in group:
            if test.get("hidden"):
                test.pop("expected", None)
                continue
            value = example_output(outcomes[test["name"]])
            if test.get("expected") != value:
                test["expected"] = value
                changed += 1
    return changed


def main() -> None:
    for path in sorted(CONTENT_DIR.glob("*.json")) + sorted(TRACKS_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        content = data["content"] if "content" in data and "tasks" in data else data
        changed = sum(annotate(entry) for entry in content.values())
        if changed:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"{path.name}: {changed} examples updated")


if __name__ == "__main__":
    main()
