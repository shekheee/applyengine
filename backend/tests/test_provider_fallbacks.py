import asyncio
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


class AsyncChatProvider:
    def __init__(self, name: str, model: str, tokens: list[str], delay: float = 0):
        self.name = name
        self.chat_model = model
        self.tokens = tokens
        self.delay = delay
        self.max_tokens = None

    async def chat_stream_async(self, messages, max_tokens=4096):
        self.max_tokens = max_tokens
        if self.delay:
            await asyncio.sleep(self.delay)
        for token in self.tokens:
            yield token


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

    def test_live_stream_times_out_and_uses_backup_with_token_cap(self):
        slow = AsyncChatProvider("openai", "slow", ["late"], delay=0.03)
        backup = AsyncChatProvider("gemini", "backup", ["hello"])
        chain = CoachFallbackChain(
            [slow, backup],
            requested_model="slow",
            requested_provider="openai",
        )

        async def collect():
            return [
                token
                async for token in chain.chat_stream_async(
                    [{"role": "user", "content": "hi"}],
                    max_tokens=384,
                    first_token_timeout=0.01,
                )
            ]

        self.assertEqual(asyncio.run(collect()), ["hello"])
        self.assertEqual(backup.max_tokens, 384)
        self.assertEqual(chain.last_served, "gemini")
        self.assertTrue(chain.fallback_used)

    def test_first_token_timeout_does_not_poison_immediate_retry(self):
        slow = AsyncChatProvider("openai", "slow", ["late"], delay=0.03)
        chain = CoachFallbackChain(
            [slow],
            requested_model="slow",
            requested_provider="openai",
        )

        async def collect(timeout):
            return [
                token
                async for token in chain.chat_stream_async(
                    [{"role": "user", "content": "hi"}],
                    first_token_timeout=timeout,
                )
            ]

        with self.assertRaisesRegex(RuntimeError, "did not start responding"):
            asyncio.run(collect(0.01))

        chain.reset()
        self.assertEqual(asyncio.run(collect(0.1)), ["late"])


if __name__ == "__main__":
    unittest.main()
