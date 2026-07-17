from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.models import Profile

TRACK_ID = "ai_ml_engineering"

# Topic IDs are stable API/DB identifiers.
TOPIC_ALL = "all"


@dataclass(frozen=True)
class CurriculumTopic:
    id: str
    order: int
    title: str
    tagline: str
    subtopics: tuple[str, ...]
    senior_signals: tuple[str, ...]
    weak_answer_patterns: tuple[str, ...]
    strong_answer_patterns: tuple[str, ...]
    sample_questions: tuple[str, ...]


CURRICULUM_TOPICS: tuple[CurriculumTopic, ...] = (
    CurriculumTopic(
        id="ml_classics",
        order=1,
        title="ML classics",
        tagline="The filter round — every interview opens here.",
        subtopics=(
            "bias-variance tradeoff and when models under/over-fit",
            "gradient descent intuition (SGD, learning rate, convergence)",
            "regularization (L1/L2, dropout, early stopping)",
            "evaluation metrics (precision/recall/F1, ROC-AUC, calibration, leakage)",
        ),
        senior_signals=(
            "Connects metric choice to business cost asymmetry",
            "Explains tradeoffs with a concrete project example from their resume",
            "Names failure modes (data leakage, label delay, class imbalance)",
        ),
        weak_answer_patterns=(
            "Textbook definitions only with no applied example",
            "Cannot explain when to prefer one metric over another",
            "Ignores train/validation/test discipline or leakage",
        ),
        strong_answer_patterns=(
            "Defines concept clearly then grounds in a real experiment or deployment",
            "States assumptions and what would break the approach",
            "Mentions how they validated the model before shipping",
        ),
        sample_questions=(
            "Explain bias-variance in the context of a model you shipped — where did you sit on that spectrum?",
            "How do you choose evaluation metrics when false positives and false negatives have different business costs?",
            "Walk through how gradient descent and regularization showed up in a project on your resume.",
        ),
    ),
    CurriculumTopic(
        id="llm_fundamentals",
        order=2,
        title="LLM fundamentals",
        tagline="Attention, tokenization, fine-tuning vs prompting, context windows, MoEs.",
        subtopics=(
            "transformer attention (self-attention, multi-head, complexity)",
            "tokenization and why token count drives cost",
            "fine-tuning vs prompting vs RAG — when each fits",
            "context windows, KV cache, and mixture-of-experts (MoE) basics",
            "why context length affects cost and latency",
        ),
        senior_signals=(
            "Explains cost/latency implications of context length and model size",
            "Compares fine-tuning vs prompting with decision criteria, not slogans",
            "Can reason about token budgets in production",
        ),
        weak_answer_patterns=(
            "Only defines attention mathematically with no systems intuition",
            "Says 'use RAG for everything' without tradeoffs",
            "Cannot explain why longer prompts cost more or run slower",
        ),
        strong_answer_patterns=(
            "Links LLM mechanics to a product constraint (latency SLA, budget, quality bar)",
            "Explains when they'd reach for fine-tuning vs in-context learning",
            "Quantifies token/context impact on cost or latency",
        ),
        sample_questions=(
            "Why does context length affect both cost and latency in an LLM serving stack?",
            "When would you fine-tune vs prompt-engineer vs RAG for a task tied to your experience?",
            "Explain attention to an engineer — what problem does it solve and what does it cost at scale?",
        ),
    ),
    CurriculumTopic(
        id="rag",
        order=3,
        title="RAG",
        tagline="Chunking, embeddings, retrieval evaluation.",
        subtopics=(
            "chunking strategies (fixed, semantic, hierarchical, overlap)",
            "embedding model tradeoffs (quality, dimension, latency, cost)",
            "retrieval evaluation (recall@k, MRR, human eval, golden sets)",
            "hybrid search, reranking, and grounding failures",
        ),
        senior_signals=(
            "Describes how they measured retrieval quality before trusting generation",
            "Explains chunking choice for their document types",
            "Names hallucination/grounding failure modes and mitigations",
        ),
        weak_answer_patterns=(
            "Generic 'split into chunks and embed' with no eval plan",
            "Cannot describe how they'd know retrieval is good enough",
            "Ignores domain-specific document structure",
        ),
        strong_answer_patterns=(
            "Walks through end-to-end RAG with eval loop and iteration",
            "Ties embedding/chunk choices to observed failure cases",
            "References real stack components from their experience",
        ),
        sample_questions=(
            "How would you chunk and evaluate retrieval for documents like those in your past projects?",
            "What metrics would you use to know RAG retrieval is good enough before launch?",
            "Describe an embedding or reranking tradeoff you made in production or a serious prototype.",
        ),
    ),
    CurriculumTopic(
        id="agent_fundamentals",
        order=4,
        title="Agent fundamentals",
        tagline="Tool use, planning loops, memory — where most candidates go blank.",
        subtopics=(
            "tool use / function calling patterns",
            "planning loops (ReAct, plan-and-execute, reflection)",
            "short-term vs long-term agent memory",
            "single-agent vs multi-agent design tradeoffs",
        ),
        senior_signals=(
            "Explains when an agent is warranted vs a single LLM call",
            "Describes control flow for tool errors and retries",
            "Clear on memory scope and stale-state risks",
        ),
        weak_answer_patterns=(
            "Calls everything an 'agent' with no loop or state model",
            "No plan for tool-call failures or ambiguous tool outputs",
            "Hand-waves memory without eviction or grounding strategy",
        ),
        strong_answer_patterns=(
            "Sketches agent loop with explicit stop conditions",
            "Separates orchestration from model reasoning",
            "Grounds design in a concrete workflow from their resume",
        ),
        sample_questions=(
            "Design an agent loop for a workflow you've done — what tools, what memory, what stop condition?",
            "When is a single LLM call enough vs when do you need an agent?",
            "How do you handle a tool returning partial or wrong data mid-loop?",
        ),
    ),
    CurriculumTopic(
        id="orchestration_protocols",
        order=5,
        title="Orchestration & protocols",
        tagline="MCP, A2A, puppeteer pattern — systems thinking, not just models.",
        subtopics=(
            "Model Context Protocol (MCP) and tool/server boundaries",
            "agent-to-agent (A2A) coordination patterns",
            "puppeteer / orchestrator vs monolithic do-everything agent",
            "separation of concerns across specialist sub-agents",
        ),
        senior_signals=(
            "Articulates why orchestrator + specialists beats one giant agent",
            "Names protocol boundaries and security implications",
            "Maps components to observability and ownership",
        ),
        weak_answer_patterns=(
            "One mega-prompt that does planning, tools, and memory with no structure",
            "Cannot explain why MCP or similar boundaries matter",
            "No consideration of auth, scope, or blast radius",
        ),
        strong_answer_patterns=(
            "Decomposes system into orchestrator, workers, and shared state",
            "Explains protocol choice for interoperability or vendor isolation",
            "Discusses failure isolation between agents",
        ),
        sample_questions=(
            "Why does a puppeteer/orchestrator pattern beat one giant agent for a multi-step workflow?",
            "How would MCP or similar tool boundaries change how you'd structure an AI feature?",
            "Describe how two agents would hand off work without duplicating state.",
        ),
    ),
    CurriculumTopic(
        id="eval_failure_modes",
        order=6,
        title="Evaluation & failure modes",
        tagline="How you know an agent worked — the senior signal.",
        subtopics=(
            "offline vs online eval for LLM/agent systems",
            "hallucination detection and grounding checks",
            "tool-call error taxonomy (schema, timeout, wrong tool, bad args)",
            "cost blowouts and runaway loops",
        ),
        senior_signals=(
            "Defines success criteria before shipping",
            "Maintains golden sets or human eval loops",
            "Monitors production failure modes with alerts",
        ),
        weak_answer_patterns=(
            "'We'll eyeball outputs' with no eval harness",
            "Conflates demo success with production reliability",
            "No plan for runaway agent loops or spend caps",
        ),
        strong_answer_patterns=(
            "Layered eval: unit tool tests, trajectory eval, human review, online metrics",
            "Concrete failure stories and how they detected them",
            "Budget/latency guardrails tied to observability",
        ),
        sample_questions=(
            "How would you know an agentic feature is working in production — what would you measure?",
            "Walk through failure modes you've seen or would expect: hallucination, bad tool calls, cost blowouts.",
            "What would your eval stack look like before v1 of an LLM feature?",
        ),
    ),
    CurriculumTopic(
        id="system_design_agentic",
        order=7,
        title="System design for agentic & LLM systems",
        tagline="The senior whiteboard — agentic pipelines at scale.",
        subtopics=(
            "state management across agent calls",
            "retry/fallback logic and idempotency",
            "human-in-the-loop checkpoints",
            "observability for multi-step chains (traces, spans, eval logs)",
            "serving at scale: caching, batching, model routing",
            "rate limits and cost-per-request controls",
        ),
        senior_signals=(
            "Draws data flow with state store and checkpoint boundaries",
            "Explains routing between small and frontier models per step",
            "Covers observability, SLOs, and graceful degradation",
        ),
        weak_answer_patterns=(
            "Single-box 'call OpenAI' diagram",
            "No retry/idempotency for tool side effects",
            "Ignores caching, batching, or queueing at scale",
        ),
        strong_answer_patterns=(
            "End-to-end diagram: ingress, router, workers, state, eval, human review",
            "Quantifies cost-per-request and scaling bottlenecks",
            "Names concrete tech choices tied to constraints",
        ),
        sample_questions=(
            "Design an agentic pipeline for processing user requests at scale — state, retries, observability.",
            "Where would you put human-in-the-loop checkpoints in a multi-step LLM workflow?",
            "How would you route tasks between a small model and a frontier model in production?",
        ),
    ),
    CurriculumTopic(
        id="cost_latency",
        order=8,
        title="Cost & latency tradeoffs",
        tagline="Production budget awareness — small vs frontier models.",
        subtopics=(
            "when to use small vs frontier models per pipeline stage",
            "token budgeting, prompt compression, caching strategies",
            "latency budgets (TTFT, tokens/sec, parallelization)",
            "cost-per-request estimation and spend caps",
        ),
        senior_signals=(
            "Maps pipeline stages to model tier with reasoning",
            "Estimates or has measured cost-per-request",
            "Balanced quality vs speed vs spend with explicit tradeoffs",
        ),
        weak_answer_patterns=(
            "Always use the biggest model",
            "No caching, batching, or routing strategy",
            "Cannot articulate latency vs quality tradeoff",
        ),
        strong_answer_patterns=(
            "Stage-based routing table (classify → cheap, generate → frontier, verify → small)",
            "Mentions caching embeddings, prompt templates, or KV reuse",
            "Ties decisions to SLA and monthly budget",
        ),
        sample_questions=(
            "Walk through which steps in an agent pipeline deserve a frontier model vs a small model — and why.",
            "How would you estimate and cap cost-per-request for an LLM feature?",
            "What would you cache or batch first to cut latency and spend?",
        ),
    ),
)

TOPIC_BY_ID: dict[str, CurriculumTopic] = {t.id: t for t in CURRICULUM_TOPICS}

_ML_KEYWORDS = frozenset(
    {
        "machine learning",
        "ml",
        "data science",
        "data scientist",
        "ai",
        "artificial intelligence",
        "deep learning",
        "nlp",
        "llm",
        "rag",
        "pytorch",
        "tensorflow",
        "spark",
        "mlops",
        "computer vision",
        "recommendation",
        "neural",
    }
)


def is_ml_relevant_profile(profile: Profile | None) -> bool:
    """Heuristic: surface AI/ML curriculum prominently for DS/AI/ML resumes."""
    if profile is None:
        return False
    blob = " ".join(
        [
            profile.summary or "",
            " ".join(str(s) for s in (profile.skills or [])),
            " ".join(
                f"{e.get('title', '')} {e.get('company', '')}"
                for e in (profile.experience or [])
                if isinstance(e, dict)
            ),
        ]
    ).lower()
    return any(kw in blob for kw in _ML_KEYWORDS)


def normalize_curriculum_topic(topic_id: str | None) -> str:
    if not topic_id or topic_id in ("none", ""):
        return ""
    if topic_id == TOPIC_ALL:
        return TOPIC_ALL
    return topic_id if topic_id in TOPIC_BY_ID else ""


def topic_label(topic_id: str) -> str:
    if topic_id == TOPIC_ALL:
        return "All AI/ML topics"
    t = TOPIC_BY_ID.get(topic_id)
    return t.title if t else topic_id.replace("_", " ").title()


def curriculum_for_api() -> dict[str, Any]:
    return {
        "track_id": TRACK_ID,
        "track_title": "AI/ML Engineering",
        "track_description": (
            "Eight-topic interview curriculum for ML/AI/LLM engineering roles — "
            "from ML classics through agentic system design and cost tradeoffs."
        ),
        "topics": [
            {
                "id": t.id,
                "order": t.order,
                "title": t.title,
                "tagline": t.tagline,
                "subtopics": list(t.subtopics),
                "senior_signals": list(t.senior_signals),
                "weak_answer_patterns": list(t.weak_answer_patterns),
                "strong_answer_patterns": list(t.strong_answer_patterns),
            }
            for t in CURRICULUM_TOPICS
        ],
    }


def topics_for_session(topic_id: str) -> list[CurriculumTopic]:
    if topic_id == TOPIC_ALL:
        return list(CURRICULUM_TOPICS)
    t = TOPIC_BY_ID.get(topic_id)
    return [t] if t else []


def curriculum_prompt_block(topic_id: str) -> str:
    """Rich context for LLM question generation, feedback, and summary."""
    topics = topics_for_session(topic_id)
    if not topics:
        return ""

    lines = [
        "AI/ML ENGINEERING INTERVIEW CURRICULUM (active for this session):",
        "Generate/evaluate against these topic rubrics. Mix conceptual and applied questions.",
        "Ground applied questions in the candidate's REAL resume — never invent projects.",
        "",
    ]
    for t in topics:
        lines.extend(
            [
                f"## Topic {t.order}: {t.title} (id={t.id})",
                f"Context: {t.tagline}",
                "Subtopics: " + "; ".join(t.subtopics),
                "Senior signals (reward these): " + "; ".join(t.senior_signals),
                "Weak answer patterns (penalize): " + "; ".join(t.weak_answer_patterns),
                "Strong answer patterns: " + "; ".join(t.strong_answer_patterns),
                "",
            ]
        )
    if topic_id == TOPIC_ALL:
        lines.append(
            "For 'all topics': distribute 5-6 questions across different topic ids. "
            "Set each question's category to the topic id (e.g. ml_classics, rag)."
        )
    else:
        lines.append(
            f"Focus ALL questions on topic id={topic_id}. "
            f"Set each question's category to '{topic_id}'."
        )
    return "\n".join(lines)


def feedback_rubric_block(topic_id: str, question_category: str | None = None) -> str:
    """Evaluation rubric for feedback on a specific answer."""
    cat = question_category or topic_id
    if cat == TOPIC_ALL or not cat:
        return curriculum_prompt_block(topic_id) if topic_id else ""
    t = TOPIC_BY_ID.get(cat)
    if not t:
        return curriculum_prompt_block(topic_id) if topic_id else ""
    return (
        f"Evaluate using the '{t.title}' senior-signal rubric:\n"
        f"Senior signals: {'; '.join(t.senior_signals)}\n"
        f"Penalize: {'; '.join(t.weak_answer_patterns)}\n"
        f"Reward: {'; '.join(t.strong_answer_patterns)}"
    )


def fallback_curriculum_questions(
    topic_id: str,
    profile: Profile | None,
    job_title: str = "",
) -> list[dict[str, Any]]:
    """Deterministic fallback when LLM question generation fails."""
    topics = topics_for_session(topic_id)
    if not topics:
        return []

    recent = ""
    if profile and profile.experience:
        exp = profile.experience[0]
        if isinstance(exp, dict):
            recent = f" from your work at {exp.get('company', 'your recent role')}"

    role = job_title or "an AI/ML engineering role"
    out: list[dict[str, Any]] = []
    for t in topics[:6]:
        q = t.sample_questions[0]
        if recent and "your" in q.lower():
            q = q.replace("your resume", f"your experience{recent}")
        out.append(
            {
                "text": q,
                "category": t.id,
                "tip": f"Cover: {'; '.join(t.subtopics[:2])}. Show senior signal: {t.senior_signals[0]}",
            }
        )
    if topic_id == TOPIC_ALL and len(out) < 6:
        for t in CURRICULUM_TOPICS[len(out) : 6]:
            out.append(
                {
                    "text": t.sample_questions[0],
                    "category": t.id,
                    "tip": t.senior_signals[0],
                }
            )
    return out[:6]
