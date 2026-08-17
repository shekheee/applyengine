import unittest

from app.llm.answer_length import answer_length_instruction, normalize_answer_length
from app.services.coach import build_coach_messages


class AnswerLengthTests(unittest.TestCase):
    def test_normalizes_supported_lengths(self):
        self.assertEqual(normalize_answer_length(" concise "), "concise")
        self.assertEqual(normalize_answer_length("normal"), "normal")
        self.assertEqual(normalize_answer_length("DETAILED"), "detailed")

    def test_rejects_unknown_length(self):
        with self.assertRaises(ValueError):
            normalize_answer_length("unlimited")

    def test_each_length_has_distinct_guidance(self):
        concise = answer_length_instruction("concise")
        normal = answer_length_instruction("normal")
        detailed = answer_length_instruction("detailed")
        self.assertIn("250 words", concise)
        self.assertIn("600 words", normal)
        self.assertIn("1,200 words", detailed)

    def test_coach_system_message_includes_selected_length(self):
        messages = build_coach_messages(
            "Explain my fit.", None, [], [], answer_length="concise"
        )
        self.assertIn("RESPONSE LENGTH FOR THIS TURN", messages[0]["content"])
        self.assertIn("250 words", messages[0]["content"])


if __name__ == "__main__":
    unittest.main()
