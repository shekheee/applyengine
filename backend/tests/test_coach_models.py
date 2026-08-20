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
            openai_chat_model="gpt-5.6-sol",
            openai_coach_models="gpt-5.6-sol,gpt-5.5",
            anthropic_api_key="test-anthropic",
            GEMINI_API_KEY="test-gemini",
            coach_provider_chain="openai,gemini",
            memory_model="gpt-5.6-sol",
        )

    def test_default_models_exclude_unavailable_claude(self):
        ids = {model.id for model in available_coach_models(self.settings)}

        self.assertTrue({"gpt-5.6-sol", "gemini-3.1-pro-preview"}.issubset(ids))
        self.assertFalse(any(model.startswith("claude-") for model in ids))

    def test_gpt_is_default(self):
        self.assertEqual(default_coach_model_id(self.settings), "gpt-5.6-sol")

    def test_model_catalogue_follows_fallback_order(self):
        providers = [model.provider for model in available_coach_models(self.settings)]
        self.assertLess(providers.index("openai"), providers.index("gemini"))
        self.assertNotIn("anthropic", providers)
        self.assertEqual(available_coach_models(self.settings)[0].id, "gpt-5.6-sol")

    def test_each_requested_model_resolves_to_its_provider(self):
        expected = {
            "gpt-5.6-sol": "openai",
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
