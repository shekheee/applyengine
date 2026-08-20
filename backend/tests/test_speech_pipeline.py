from types import SimpleNamespace
import unittest
from unittest.mock import patch

from app.services import speech


class _FakeTranscriptions:
    def __init__(self):
        self.models: list[str] = []
        self.files: list[object] = []

    def create(self, **kwargs):
        model = kwargs["model"]
        self.models.append(model)
        self.files.append(kwargs["file"])
        if model == "gpt-4o-transcribe":
            raise RuntimeError("model temporarily unavailable")
        return SimpleNamespace(
            text="I led the recovery and reduced stale runs.",
            duration=8.0,
            segments=[],
        )


class _FakeSpeech:
    def __init__(self):
        self.calls = 0

    def create(self, **kwargs):
        self.calls += 1
        return SimpleNamespace(content=b"audio")


class SpeechPipelineTests(unittest.TestCase):
    def test_transcription_falls_back_and_uses_browser_pause_measurements(self):
        transcriptions = _FakeTranscriptions()
        client = SimpleNamespace(audio=SimpleNamespace(transcriptions=transcriptions))
        settings = SimpleNamespace(
            openai_api_key="test",
            speech_transcription_model_list=["gpt-4o-transcribe", "whisper-1"],
        )

        with patch.object(speech, "get_settings", return_value=settings), patch.object(
            speech, "_speech_client", return_value=client
        ):
            result = speech.transcribe_audio(
                b"x" * 200,
                "audio/webm",
                duration_hint=8,
                client_metrics={
                    "input_quality": "good",
                    "pauses": [{"duration_ms": 1250}],
                },
            )

        self.assertEqual(transcriptions.models, ["gpt-4o-transcribe", "whisper-1"])
        self.assertTrue(all(isinstance(file, tuple) for file in transcriptions.files))
        self.assertTrue(all(isinstance(file[1], bytes) for file in transcriptions.files))
        self.assertTrue(all(file[2] == "audio/webm" for file in transcriptions.files))
        self.assertEqual(result["model"], "whisper-1")
        self.assertTrue(result["fallback_used"])
        self.assertEqual(result["delivery"]["pause_count"], 1)
        self.assertEqual(result["delivery"]["capture_quality"]["input_quality"], "good")

    def test_tts_reuses_cached_audio(self):
        generated = _FakeSpeech()
        client = SimpleNamespace(audio=SimpleNamespace(speech=generated))
        settings = SimpleNamespace(openai_api_key="test", speech_tts_model="tts-1")
        speech._synthesize_speech_cached.cache_clear()

        with patch.object(speech, "get_settings", return_value=settings), patch.object(
            speech, "_speech_client", return_value=client
        ):
            first = speech.synthesize_speech("Tell me about your work.")
            second = speech.synthesize_speech("Tell me about your work.")

        self.assertEqual(first, second)
        self.assertEqual(generated.calls, 1)


if __name__ == "__main__":
    unittest.main()
