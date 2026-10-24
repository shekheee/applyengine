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
TRACKS_DIR = DATA_DIR / "prep_tracks"
PRELUDE_FILE = (
    Path(__file__).resolve().parents[2]
    / "frontend" / "src" / "components" / "shared" / "runner-prelude.ts"
)
EXTRA_URL = re.compile(r"^https://leetcode\.com/problems/[a-z0-9-]+/$")
CODE_TYPES = {"python", "drill", "lld", "fundamentals"}

# The description states the problem; how to solve it belongs in hints and the solution.
# A banned phrase is allowed when it is part of the task's own title.
DSA_SPOILERS = (
    "hash map", "hashmap", "hash set", "hashset", "dictionary", "prefix sum", "sliding window",
    "two pointer", "two-pointer", "monotonic", "binary search", "heap", "priority queue",
    "dynamic programming", "memoiz", "bfs", "dfs", "breadth-first", "depth-first",
    "union find", "union-find", "disjoint set", "topological", "backtrack", "greedy", "trie",
    "dijkstra", "bellman", "kadane", "bucket sort", "quickselect", "bit manipulation",
    "stack", "queue", "deque", "recursi", "pointer", "pointers", "o(n", "o(log", "o(1",
)
DESIGN_SPOILERS = (
    "strategy", "factory", "observer", "state pattern", "decorator", "adapter",
    "template method", "singleton", "command pattern", "chain of responsibility",
    "design pattern", "### patterns",
)
HLD_SPOILERS = (
    "what the interviewer probes", "base62", "base-62", "fan-out", "fanout",
    "consistent hashing", "quorum", "geohash", "bloom filter", "token bucket",
    "leaky bucket", "snowflake", "trie", "websocket", "long polling", "kafka", "redis",
    "cassandra", "dynamodb", "### model answer", "deep dive:",
)
BRIEF_SPOILER_HEADINGS = ("key insight", "### approach", "### solution", "the trick")


# Bans that should also catch longer words starting with them (memoize, backtracking...).
PREFIX_BANS = {"memoiz", "backtrack", "recursi", "o(n", "o(log", "o(1", "### patterns"}


def _phrase(banned: str) -> re.Pattern[str]:
    tail = "" if banned in PREFIX_BANS else r"(?![a-z0-9])"
    return re.compile(r"(?<![a-z0-9])" + re.escape(banned) + tail)


def spoilers(text: str, banned: tuple[str, ...], title: str) -> list[str]:
    """Banned phrases present as whole words (so "trie" does not match "retrieval")."""
    lowered, allowed = text.lower(), title.lower()
    return [b for b in banned if _phrase(b).search(lowered) and not _phrase(b).search(allowed)]
FENCE = re.compile(r"```python\n(.*?)```", re.S)


def load_extra_tasks() -> list[dict]:
    tasks: list[dict] = []
    for path in sorted(EXTRA_DIR.glob("*.json")):
        tasks += json.loads(path.read_text(encoding="utf-8"))["tasks"]
    return tasks


def load_track_tasks() -> list[dict]:
    tasks: list[dict] = []
    for path in sorted(TRACKS_DIR.glob("*.json")):
        tasks += json.loads(path.read_text(encoding="utf-8"))["tasks"]
    return tasks


def load_content() -> dict[str, dict]:
    merged: dict[str, dict] = {}
    sources = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(CONTENT_DIR.glob("*.json"))]
    sources += [
        json.loads(p.read_text(encoding="utf-8"))["content"]
        for folder in (EXTRA_DIR, TRACKS_DIR)
        for p in sorted(folder.glob("*.json"))
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
    return [(name, error, len(records)) for name, error, records in run_cases(code, tests)]


def example_output(records: list[dict]) -> str:
    """How an example's Output reads in the problem description."""
    return "\n".join(
        f"{r['label']}: {r['expected']}" if r.get("label") and len(records) > 1 else r["expected"]
        for r in records
    )


def run_cases(code: str, tests: list[dict]) -> list[tuple[str, str | None, list[dict]]]:
    """(name, error or None, expect() records) per test."""
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
            outcomes.append((test["name"], error, list(namespace["_EXPECTS"])))
        return outcomes
    finally:
        loop.close()


def solution_code(entry: dict) -> str:
    blocks = FENCE.findall(entry.get("solution", ""))
    return "\n\n".join(blocks)


class PrepContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tasks = {
            t["id"]: t for t in load_seed()["tasks"] + load_extra_tasks() + load_track_tasks()
        }
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
                self.assertIn(task["difficulty"], ("easy", "medium", "hard"))
                minutes = {"easy": 20, "medium": 35, "hard": 45}[task["difficulty"]]
                self.assertEqual(task["target_minutes"], minutes)
                self.assertRegex(task["url"], EXTRA_URL)
                self.assertIn(task["week"], range(1, 9))

    def test_track_entries(self):
        prefixes = {"challenge": "ch-", "fundamentals": "fu-", "hld": "hld-c", "lld": "lld-c"}
        seen: set[str] = set()
        for task in load_track_tasks():
            with self.subTest(task=task.get("id")):
                self.assertIn(task["type"], prefixes)
                self.assertTrue(task["id"].startswith(prefixes[task["type"]]))
                self.assertNotIn(task["id"], seen)
                seen.add(task["id"])
                self.assertEqual(task["slot"], "weekly")
                self.assertIn(task["week"], range(1, 11))
                self.assertTrue(task["title"] and task["target_minutes"] >= 20)
                if task["type"] == "hld":
                    self.assertEqual(len(task.get("framework") or []), 7, "HLD uses the 7-step framework")

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
                title = self.tasks[task_id]["title"]
                if task_type == "dsa":
                    statement = entry.get("statement", "")
                    self.assertFalse(entry.get("brief"), "DSA tasks show a statement, not a brief")
                    self.assertGreater(len(statement), 200, "DSA tasks need a problem statement")
                    for part in ("Example 1", "Constraints"):
                        self.assertIn(part, statement)
                    self.assertEqual(spoilers(statement, DSA_SPOILERS, title), [], "statement gives away the approach")
                else:
                    brief = entry.get("brief", "")
                    self.assertGreater(len(brief.strip()), 150)
                    self.assertEqual(spoilers(brief, BRIEF_SPOILER_HEADINGS, title), [])
                    if task_type == "lld":
                        self.assertEqual(spoilers(brief, DESIGN_SPOILERS, title), [], "brief names the design")
                    if task_type == "hld":
                        self.assertEqual(spoilers(brief, HLD_SPOILERS, title), [], "brief gives away the design")
                for level in entry.get("levels") or []:
                    self.assertEqual(spoilers(level["brief"], DESIGN_SPOILERS + BRIEF_SPOILER_HEADINGS, title), [])
                if entry.get("learn") is not None:
                    self.assertIsInstance(entry["learn"], str)
                if task_type == "challenge":
                    self.check_levels(entry)
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

    def check_case(self, test: dict) -> None:
        self.assertTrue(test.get("name") and test.get("code"))
        self.assertIsInstance(test.get("input"), str, "each case shows its input")
        self.assertTrue(test["input"].strip())
        self.assertIsInstance(test.get("hidden", False), bool)

    def check_levels(self, entry: dict) -> None:
        levels = entry.get("levels")
        self.assertIsInstance(levels, list)
        self.assertEqual(len(levels), 4, "challenges have exactly 4 levels")
        self.assertTrue(entry.get("starter", "").strip(), "challenges need a starter")
        self.assertTrue(solution_code(entry), "solution needs a ```python block")
        self.assertEqual(entry.get("tests") or [], [], "challenge tests live in levels")
        for level in levels:
            self.assertTrue(level.get("title") and level.get("brief", "").strip())
            self.assertTrue(3 <= len(level.get("tests", [])) <= 8, "3-8 cases per level")
            self.assertFalse(level["tests"][0].get("hidden"), "each level opens with an example")
            for test in level["tests"]:
                self.check_case(test)

    def test_challenge_levels_build_on_each_other(self):
        for task_id, entry in self.content.items():
            if self.tasks[task_id]["type"] != "challenge":
                continue
            with self.subTest(task=task_id):
                cumulative: list[dict] = []
                for number, level in enumerate(entry["levels"], start=1):
                    cumulative += level["tests"]
                    outcomes = run_tests(solution_code(entry), cumulative)
                    failures = [(n, e) for n, e, _ in outcomes if e]
                    self.assertEqual(failures, [], f"solution must pass levels 1-{number}")
                    silent = [n for n, _, expects in outcomes if expects == 0]
                    self.assertEqual(silent, [], "each case must call expect()")
                starter = run_tests(entry["starter"], entry["levels"][0]["tests"])
                self.assertTrue(any(e for _, e, _ in starter), "starter must fail level 1")

    def test_examples_show_the_reference_output(self):
        """Visible cases carry `expected`, the Output shown in the description."""
        for task_id, entry in self.content.items():
            groups = [lvl["tests"] for lvl in entry.get("levels") or []] or [entry.get("tests") or []]
            if not any(groups):
                continue
            with self.subTest(task=task_id):
                cumulative: list[dict] = []
                for group in groups:
                    cumulative += group
                    outcomes = dict(
                        (name, records) for name, _, records in run_cases(solution_code(entry), cumulative)
                    )
                    for test in group:
                        if test.get("hidden"):
                            continue
                        self.assertEqual(
                            test.get("expected"),
                            example_output(outcomes[test["name"]]),
                            f"{test['name']}: run scripts/annotate_prep_examples.py",
                        )

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
