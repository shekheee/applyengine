/**
 * Python run before the learner's code in every CodeRunner session. Tests call
 * expect()/expect_raises() so the console can show Output vs Expected per case.
 * backend/tests/test_prep_content.py reads this exact block, so the CI checker
 * and the browser run tests the same way.
 */
export const RUNNER_PRELUDE = `
# --- runner prelude: begin ---
import math as _math

_EXPECTS = []


def _same(actual, expected):
    if isinstance(actual, bool) or isinstance(expected, bool):
        return actual == expected
    if isinstance(actual, float) or isinstance(expected, float):
        try:
            return _math.isclose(actual, expected, rel_tol=1e-6, abs_tol=1e-9)
        except TypeError:
            return False
    return actual == expected


def _show(value):
    text = repr(value)
    return text if len(text) <= 2000 else text[:2000] + " ..."


def expect(actual, expected, label=None):
    """Record one comparison; raise on mismatch so the case fails here."""
    ok = _same(actual, expected)
    _EXPECTS.append(
        {"label": label, "actual": _show(actual), "expected": _show(expected), "ok": ok}
    )
    if not ok:
        raise AssertionError(
            f"{label + ': ' if label else ''}got {_show(actual)}, expected {_show(expected)}"
        )
    return actual


def expect_raises(exc_type, fn, *args, label=None, **kwargs):
    """Call fn and record whether it raised exc_type."""
    name = getattr(exc_type, "__name__", str(exc_type))
    try:
        result = fn(*args, **kwargs)
    except exc_type as error:
        _EXPECTS.append(
            {"label": label, "actual": f"raised {type(error).__name__}", "expected": f"raises {name}", "ok": True}
        )
        return error
    except Exception as error:
        actual = f"raised {type(error).__name__}: {error}"
    else:
        actual = f"returned {_show(result)}"
    _EXPECTS.append({"label": label, "actual": actual, "expected": f"raises {name}", "ok": False})
    raise AssertionError(f"{label + ': ' if label else ''}{actual}, expected it to raise {name}")


async def expect_raises_async(exc_type, awaitable, label=None):
    """Await a coroutine and record whether it raised exc_type."""
    name = getattr(exc_type, "__name__", str(exc_type))
    try:
        result = await awaitable
    except exc_type as error:
        _EXPECTS.append(
            {"label": label, "actual": f"raised {type(error).__name__}", "expected": f"raises {name}", "ok": True}
        )
        return error
    except Exception as error:
        actual = f"raised {type(error).__name__}: {error}"
    else:
        actual = f"returned {_show(result)}"
    _EXPECTS.append({"label": label, "actual": actual, "expected": f"raises {name}", "ok": False})
    raise AssertionError(f"{label + ': ' if label else ''}{actual}, expected it to raise {name}")
# --- runner prelude: end ---
`;
