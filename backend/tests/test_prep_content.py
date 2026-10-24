"""Checks the authored Interview Prep content in app/data/prep_content/.

Each task's tests run the way the in-browser CodeRunner runs them: the code
executes in a fresh namespace (top-level await allowed), then each test runs
in that same namespace and passes if it raises nothing. Every test must pass
against the reference solution, and the blank starter must fail at least one.
"""
import ast
import asyncio
import json
import re
import unittest
from pathlib import Path

from app.services.prep_seed import load_seed

DATA_DIR = Path(__file__).resolve().parent.parent / "app" / "data"
CONTENT_DIR = DATA_DIR / "prep_content"
EXTRA_DIR = DATA_DIR / "prep_extra"
PRELUDE_FILE = (
    Path(__file__).resolve().parents[2]
    / "frontend" / "src" / "components" / "shared" / "runner-prelude.ts"
)
EXTRA_URL = re.compile(r"^https://leetcode\.com/problems/[a-z0-9-]+/$")
CODE_TYPES = {"python", "drill", "lld"}
FENCE = re.compile(r"```python\n(.*?)```", re.S)


def load_extra_tasks() -> list[dict]:
    tasks: list[dict] = []
    for path in sorted(EXTRA_DIR.glob("*.json")):
        tasks += json.loads(path.read_text(encoding="utf-8"))["tasks"]
    return tasks


def load_content() -> dict[str, dict]:
    merged: dict[str, dict] = {}
    sources = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(CONTENT_DIR.glob("*.json"))]
    sources += [
        json.loads(p.read_text(encoding="utf-8"))["content"] for p in sorted(EXTRA_DIR.glob("*.json"))
    ]
    for source in sources:
        for task_id, entry in source.items():
            if task_id in merged:
                raise AssertionError(f"{task_id} appears in more than one content file")
            merged[task_id] = entry
    return merged


def run_source(source: str, namespace: dict, loop: asyncio.AbstractEventLoop) -> None:
    code = compile(source, "<exec>", "exec", flags=ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
    result = eval(code, namespace)  # noqa: S307 - running our own authored content
    if asyncio.iscoroutine(result):
        loop.run_until_complete(asyncio.wait_for(result, timeout=20))


def runner_prelude() -> str:
    """The Python the browser CodeRunner runs before the learner's code."""
    text = PRELUDE_FILE.read_text(encoding="utf-8")
    match = re.search(
        r"# --- runner prelude: begin ---\n(.*?)# --- runner prelude: end ---", text, re.S
    )
    if not match:
        raise AssertionError("runner prelude markers not found in runner-prelude.ts")
    return match.group(1)


def run_tests(code: str, tests: list[dict]) -> list[tuple[str, str | None, int]]:
    """(name, error or None, number of expect() records) per test."""
    loop = asyncio.new_event_loop()
    try:
        namespace: dict = {"__name__": "__main__"}
        run_source(runner_prelude(), namespace, loop)
        run_source(code, namespace, loop)
        outcomes = []
        for test in tests:
            namespace["_EXPECTS"].clear()
            try:
                run_source(test["code"], namespace, loop)
                error = None
            except Exception as exc:  # noqa: BLE001 - a failing test is data here
                error = f"{type(exc).__name__}: {exc}"
            outcomes.append((test["name"], error, len(namespace["_EXPECTS"])))
        return outcomes
    finally:
        loop.close()


def solution_code(entry: dict) -> str:
    blocks = FENCE.findall(entry.get("solution", ""))
    return "\n\n".join(blocks)


class PrepContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tasks = {t["id"]: t for t in load_seed()["tasks"] + load_extra_tasks()}
        cls.content = load_content()

    def test_every_task_has_content_and_ids_match_the_seed(self):
        self.assertEqual(set(self.content) - set(self.tasks), set(), "unknown task ids")
        self.assertEqual(set(self.tasks) - set(self.content), set(), "tasks without content")

    def test_extra_bank_entries(self):
        main_numbers = {
            t["title"].split(".")[0] for t in load_seed()["tasks"] if t["type"] == "dsa"
        }
        seen: set[str] = set()
        for task in load_extra_tasks():
            with self.subTest(task=task.get("id")):
                number = task["title"].split(".")[0]
                self.assertEqual(task["id"], f"x-lc-{number}")
                self.assertNotIn(number, main_numbers, "already in the main program")
                self.assertNotIn(task["id"], seen, "duplicate extra problem")
                seen.add(task["id"])
                self.assertEqual((task["type"], task["slot"]), ("dsa", "extra"))
                self.assertIn(task["difficulty"], ("easy", "medium"))
                self.assertRegex(task["url"], EXTRA_URL)
                self.assertIn(task["week"], range(1, 9))

    def test_shape(self):
        for task_id, entry in self.content.items():
            with self.subTest(task=task_id):
                task_type = self.tasks[task_id]["type"]
                hints = entry.get("hints")
                self.assertIsInstance(hints, list)
                self.assertEqual(len(hints), 3, "exactly three tiered hints")
                for hint in hints:
                    self.assertIsInstance(hint, str)
                    self.assertGreater(len(hint.strip()), 20)
                    self.assertNotIn("```", hint, "hints must not contain code blocks")
                self.assertGreater(len(entry.get("solution", "").strip()), 80)
                if task_type != "dsa":
                    self.assertGreater(len(entry.get("brief", "").strip()), 150)
                if task_type in CODE_TYPES:
                    tests = entry.get("tests", [])
                    self.assertTrue(entry.get("starter", "").strip(), "code tasks need a starter")
                    self.assertTrue(solution_code(entry), "solution needs a ```python block")
                    self.assertTrue(8 <= len(tests) <= 14, "8-14 test cases")
                    visible = [t for t in tests if not t.get("hidden")]
                    self.assertGreaterEqual(len(visible), 2, "at least 2 example cases")
                    self.assertGreaterEqual(len(tests) - len(visible), 4, "at least 4 hidden cases")
                    self.assertFalse(tests[0].get("hidden"), "the first case is an example")
                for test in entry.get("tests", []):
                    self.assertTrue(test.get("name") and test.get("code"))
                    self.assertIsInstance(test.get("input"), str, "each case shows its input")
                    self.assertTrue(test["input"].strip())
                    self.assertIsInstance(test.get("hidden", False), bool)

    def test_reference_solutions_pass_and_starters_fail(self):
        for task_id, entry in self.content.items():
            tests = entry.get("tests") or []
            if not tests:
                continue
            with self.subTest(task=task_id):
                outcomes = run_tests(solution_code(entry), tests)
                failures = [(n, e) for n, e, _ in outcomes if e]
                self.assertEqual(failures, [], "reference solution must pass every test")
                silent = [n for n, _, expects in outcomes if expects == 0]
                self.assertEqual(silent, [], "each case must call expect() so Output shows")
                starter = run_tests(entry["starter"], tests)
                self.assertTrue(
                    any(error for _, error, _ in starter), "the blank starter must fail a test"
                )


if __name__ == "__main__":
    unittest.main()
