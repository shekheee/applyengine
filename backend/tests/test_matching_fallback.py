from app.services import matching


class BrokenEmbeddingProvider:
    def embed(self, texts: list[str]):
        raise RuntimeError("embedding provider unavailable")


class BrokenCoachChain:
    def reset(self):
        pass

    def chat_messages(self, messages):
        raise RuntimeError("coach providers unavailable")


class WorkingCoachChain:
    def reset(self):
        pass

    def chat_messages(self, messages):
        return "Provider-backed gap analysis"


class CapturingCoachChain:
    def __init__(self):
        self.messages = []

    def reset(self):
        pass

    def chat_messages(self, messages):
        self.messages = messages
        return "Score-grounded analysis"


def test_fit_uses_local_embeddings_when_remote_provider_fails(monkeypatch):
    monkeypatch.setattr(
        matching, "get_provider", lambda: BrokenEmbeddingProvider()
    )

    result = matching.compute_fit(
        "Python machine learning production systems",
        "Seeking Python and machine learning experience",
        ["Python", "machine learning"],
        ["Python", "machine learning"],
    )

    assert 0 <= result["fit_score"] <= 100
    assert result["keyword_coverage"] == 1.0
    assert result["matched_keywords"] == ["Python", "machine learning"]


def test_gap_analysis_uses_local_result_when_all_coach_providers_fail(monkeypatch):
    monkeypatch.setattr(
        matching, "build_coach_provider", lambda: BrokenCoachChain()
    )
    fit = {
        "fit_score": 62.0,
        "semantic_similarity": 0.5,
        "keyword_coverage": 0.75,
        "matched_keywords": ["Python"],
        "missing_keywords": ["Kubernetes"],
    }

    result = matching.gap_analysis("Profile", "Job", fit)

    assert "## Fit summary" in result
    assert "62.0/100" in result
    assert "Kubernetes" in result


def test_gap_analysis_prefers_available_coach_provider(monkeypatch):
    monkeypatch.setattr(
        matching, "build_coach_provider", lambda: WorkingCoachChain()
    )

    result = matching.gap_analysis(
        "Profile",
        "Job",
        {
            "fit_score": 50,
            "fit_version": "2.0",
            "fit_breakdown": {"confidence": "medium", "components": {}},
        },
    )

    assert "**50/100** — Moderate fit" in result
    assert result.endswith("Provider-backed gap analysis")


def test_keyword_coverage_is_boundary_safe_alias_aware_and_deduplicated():
    coverage, matched, missing = matching.keyword_coverage(
        ["R", "machine learning", "Power BI", "powerbi"],
        ["ML", "Power BI"],
        "Experienced product manager who built ML dashboards in Power BI",
    )

    assert coverage == 2 / 3
    assert matched == ["machine learning", "Power BI"]
    assert missing == ["R"]


def test_fit_v2_scores_requirements_and_exposes_effective_weights(monkeypatch):
    monkeypatch.setattr(
        matching,
        "_semantic_similarity_with_metadata",
        lambda *_: (0.6, "test", "fixed-embedding"),
    )

    result = matching.compute_fit(
        "Senior data scientist who built Python machine learning systems",
        "Senior ML role requiring Python, Kubernetes and Power BI",
        ["Python", "ML", "Kubernetes", "Power BI"],
        ["Python", "machine learning"],
        job_requirements=[
            "Must have Python and machine learning experience",
            "must have python and machine learning experience.",
            "Kubernetes is required",
            "Power BI is preferred",
        ],
        job_seniority="senior",
        profile_experience=[
            {"title": "Senior Data Scientist", "dates": "2018 - Present"}
        ],
    )

    assert result["fit_version"] == "2.0"
    assert result["fit_breakdown"]["confidence"] == "high"
    requirements = result["fit_breakdown"]["requirements"]
    assert [requirement["status"] for requirement in requirements] == [
        "met",
        "gap",
        "gap",
    ]
    components = result["fit_breakdown"]["components"].values()
    assert round(sum(c["weight"] for c in components if c["available"])) == 100
    assert 0 <= result["fit_score"] <= 100


def test_gap_analysis_receives_the_authoritative_fit_breakdown(monkeypatch):
    chain = CapturingCoachChain()
    monkeypatch.setattr(matching, "build_coach_provider", lambda: chain)
    fit = {
        "fit_score": 71.4,
        "fit_version": "2.0",
        "fit_breakdown": {"confidence": "high", "components": {}},
        "matched_keywords": ["Python"],
        "missing_keywords": [],
    }

    result = matching.gap_analysis("Profile", "Job", fit)

    assert "**71.4/100** — Strong fit" in result
    assert result.endswith("Score-grounded analysis")
    assert "AUTHORITATIVE FIT SCORE V2" in chain.messages[1]["content"]
    assert '"fit_score": 71.4' in chain.messages[1]["content"]
