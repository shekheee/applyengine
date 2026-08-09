import unittest

from app.llm.coach_chain import CoachFallbackChain
from app.llm.embedding_chain import EmbeddingFallbackChain


class FakeChatProvider:
    def __init__(self, name: str, model: str, reply: str = "", error: Exception | None = None):
        self.name = name
        self.chat_model = model
        self.reply = reply
        self.error = error

    def chat_messages(self, messages, json_mode=False, max_tokens=4096):
        if self.error:
            raise self.error
        return self.reply


class FailingEmbeddingProvider:
    name = "openai"
    _embed_model = "remote-test"

    def embed(self, texts):
        raise PermissionError("invalid test key")


class ProviderFallbackTests(unittest.TestCase):
    def test_coach_reports_requested_and_backup_model(self):
        chain = CoachFallbackChain(
            [
                FakeChatProvider("openai", "primary", error=RuntimeError("down")),
                FakeChatProvider("anthropic", "backup", reply="hello"),
            ],
            requested_model="primary",
            requested_provider="openai",
        )

        reply = chain.chat_messages([{"role": "user", "content": "hi"}])

        self.assertEqual(reply, "hello")
        self.assertEqual(chain.last_served, "anthropic")
        self.assertEqual(chain.last_model, "backup")
        self.assertTrue(chain.fallback_used)
        self.assertEqual(chain.fallback_reason, "primary was unavailable")
        self.assertEqual(chain.failures[0]["error"], "RuntimeError")

    def test_embeddings_fall_back_locally(self):
        chain = EmbeddingFallbackChain([FailingEmbeddingProvider()])

        vectors = chain.embed(["machine learning", "machine learning systems"])

        self.assertEqual(len(vectors), 2)
        self.assertEqual(len(vectors[0]), 512)
        self.assertEqual(chain.last_served, "local")
        self.assertEqual(chain.last_model, "local-hashing-512")
        self.assertTrue(chain.fallback_used)
        self.assertEqual(chain.failures[0]["provider"], "openai")


if __name__ == "__main__":
    unittest.main()
