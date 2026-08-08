from app.services.web_research import (
    WebResearchResult,
    WebSource,
    _anthropic_text_and_sources,
    _gemini_text_and_sources,
    _openai_text_and_sources,
    inject_research,
    should_search,
    sources_markdown,
)


def test_search_modes_and_auto_detection():
    assert should_search("Help me rewrite this bullet", "on")
    assert not should_search("Find the latest interview reports", "off")
    assert should_search("Find the latest interview reports", "auto")
    assert should_search("Research Acme company culture", "auto")
    assert not should_search("Help me answer this behavioural question", "auto")


def test_openai_result_parser_extracts_citations():
    text, sources = _openai_text_and_sources(
        {
            "output": [
                {
                    "type": "message",
                    "content": [
                        {
                            "type": "output_text",
                            "text": "Current evidence.",
                            "annotations": [
                                {
                                    "type": "url_citation",
                                    "url": "https://example.com/openai",
                                    "title": "OpenAI source",
                                }
                            ],
                        }
                    ],
                }
            ]
        }
    )
    assert text == "Current evidence."
    assert sources == [WebSource("OpenAI source", "https://example.com/openai")]


def test_anthropic_result_parser_extracts_citations():
    text, sources = _anthropic_text_and_sources(
        {
            "content": [
                {
                    "type": "text",
                    "text": "Reported evidence.",
                    "citations": [
                        {
                            "type": "web_search_result_location",
                            "url": "https://example.com/claude",
                            "title": "Claude source",
                        }
                    ],
                }
            ]
        }
    )
    assert text == "Reported evidence."
    assert sources == [WebSource("Claude source", "https://example.com/claude")]


def test_gemini_result_parser_extracts_grounding_sources():
    text, sources = _gemini_text_and_sources(
        {
            "candidates": [
                {
                    "content": {"parts": [{"text": "Grounded evidence."}]},
                    "groundingMetadata": {
                        "groundingChunks": [
                            {
                                "web": {
                                    "uri": "https://example.com/gemini",
                                    "title": "Gemini source",
                                }
                            }
                        ]
                    },
                }
            ]
        }
    )
    assert text == "Grounded evidence."
    assert sources == [WebSource("Gemini source", "https://example.com/gemini")]


def test_research_is_injected_as_untrusted_context_and_sources_are_clickable():
    result = WebResearchResult(
        text="Evidence",
        sources=[WebSource("Source", "https://example.com/source")],
        provider="openai",
    )
    messages = inject_research(
        [
            {"role": "system", "content": "Coach instructions"},
            {"role": "user", "content": "Question"},
        ],
        result,
    )
    assert messages[0]["content"] == "Coach instructions"
    assert messages[1]["role"] == "system"
    assert "untrusted external evidence" in messages[1]["content"]
    assert "https://example.com/source" in messages[1]["content"]
    assert "[Source](<https://example.com/source>)" in sources_markdown(result)
