import unittest

from app.config import Settings
from app.llm.coach_models import (
    available_coach_models,
    default_coach_model_id,
    provider_for_model,
    validate_coach_model,
)


class CoachModelCatalogueTests(unittest.TestCase):
    def setUp(self):
        self.settings = Settings(
            openai_api_key="test-openai",
            anthropic_api_key="test-anthropic",
            GEMINI_API_KEY="test-gemini",
        )

    def test_requested_models_are_selectable(self):
        ids = {model.id for model in available_coach_models(self.settings)}

        self.assertTrue(
            {
                "gpt-5.6-sol",
                "claude-opus-5",
                "claude-fable-5",
                "gemini-3.1-pro-preview",
            }.issubset(ids)
        )

    def test_claude_opus_5_is_default(self):
        self.assertEqual(default_coach_model_id(self.settings), "claude-opus-5")

    def test_model_catalogue_follows_fallback_order(self):
        providers = [model.provider for model in available_coach_models(self.settings)]
        self.assertLess(providers.index("anthropic"), providers.index("gemini"))
        self.assertLess(providers.index("gemini"), providers.index("openai"))

    def test_each_requested_model_resolves_to_its_provider(self):
        expected = {
            "gpt-5.6-sol": "openai",
            "claude-opus-5": "anthropic",
            "claude-fable-5": "anthropic",
            "gemini-3.1-pro-preview": "gemini",
        }
        for model_id, provider in expected.items():
            with self.subTest(model=model_id):
                self.assertEqual(
                    validate_coach_model(model_id, self.settings), model_id
                )
                self.assertEqual(
                    provider_for_model(model_id, self.settings), provider
                )


if __name__ == "__main__":
    unittest.main()
