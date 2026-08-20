import unittest

from app.llm.anthropic_provider import AnthropicProvider
from app.llm.effort import (
    gemini_thinking_level,
    normalize_reasoning_effort,
    output_tokens_for_effort,
)
from app.llm.gemini_provider import GeminiProvider
from app.llm.openai_provider import OpenAIProvider


class ReasoningEffortTests(unittest.TestCase):
    def test_ui_aliases_normalize_to_native_effort(self):
        self.assertEqual(normalize_reasoning_effort("low"), "low")
        self.assertEqual(normalize_reasoning_effort("medium"), "medium")
        self.assertEqual(normalize_reasoning_effort("hard"), "high")
        self.assertEqual(normalize_reasoning_effort("very hard"), "xhigh")

    def test_invalid_effort_is_rejected(self):
        with self.assertRaises(ValueError):
            normalize_reasoning_effort("unlimited")

    def test_token_allowance_scales_with_effort(self):
        self.assertEqual(output_tokens_for_effort("low", 384), 384)
        self.assertEqual(output_tokens_for_effort("medium", 4096), 8192)
        self.assertEqual(output_tokens_for_effort("high", 4096), 16384)
        self.assertEqual(output_tokens_for_effort("xhigh", 4096), 32768)

    def test_openai_uses_reasoning_effort(self):
        provider = object.__new__(OpenAIProvider)
        provider._chat_model = "gpt-5.6-sol"
        provider._reasoning_effort = "xhigh"
        self.assertEqual(provider._reasoning_body(), {"reasoning_effort": "xhigh"})

    def test_claude_uses_adaptive_thinking_and_effort(self):
        provider = object.__new__(AnthropicProvider)
        provider._reasoning_effort = "high"
        self.assertEqual(
            provider._reasoning_body(),
            {
                "thinking": {"type": "adaptive"},
                "output_config": {"effort": "high"},
            },
        )

    def test_gemini_maps_very_hard_to_native_maximum(self):
        self.assertEqual(gemini_thinking_level("xhigh"), "high")
        provider = object.__new__(GeminiProvider)
        provider._reasoning_effort = "xhigh"
        config = provider._generation_config()
        self.assertEqual(config["thinkingConfig"], {"thinkingLevel": "high"})
        self.assertEqual(config["maxOutputTokens"], 32768)


if __name__ == "__main__":
    unittest.main()
