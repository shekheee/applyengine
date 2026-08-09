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

    result = matching.gap_analysis("Profile", "Job", {})

    assert result == "Provider-backed gap analysis"
