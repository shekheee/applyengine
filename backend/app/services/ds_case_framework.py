"""Data-science business-case track (Artefact-style consulting cases).

Holds the seven-step case framework, a bank of practice cases with facts the
interviewer reveals only when asked, and deterministic detectors for framework
coverage, value sizing and structure habits. The detectors run without any LLM
so the scorecard still works on the offline mock provider; when an LLM scores
the steps too, its semantic score wins and the detectors add hard flags.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

STEP_MAX_SCORE = 3
CASE_PACE_BAND = (130, 170)  # wpm: conversational consulting pace


@dataclass(frozen=True)
class FrameworkStep:
    id: str
    order: int
    title: str
    prompt: str
    signals: tuple[str, ...]
    misses: tuple[str, ...]
    keywords: tuple[str, ...]
    # Named sub-checks that must all be met for full marks: check id -> regex.
    checks: tuple[tuple[str, str], ...] = ()


FRAMEWORK_STEPS: tuple[FrameworkStep, ...] = (
    FrameworkStep(
        id="clarify",
        order=1,
        title="Clarify the business problem",
        prompt="Before solving anything, what would you ask to clarify the business problem?",
        signals=(
            "Asks who the decision-maker is and what decision the model informs",
            "Pins down the KPI, today's baseline and what success is worth in money",
            "Asks how the problem is handled today without a model",
        ),
        misses=(
            "Jumps straight to a model before agreeing the objective",
            "Never establishes the current baseline or KPI",
        ),
        keywords=(
            "objective", "goal", "kpi", "baseline", "success", "today", "currently",
            "decision", "stakeholder", "constraint", "clarify", "what does",
        ),
        checks=(
            ("kpi_named", r"\b(kpi|metric|objective|goal|success)\b"),
            ("baseline_today", r"\b(today|currently|current process|baseline|status quo|without a model)\b"),
        ),
    ),
    FrameworkStep(
        id="frame",
        order=2,
        title="Frame it as a data science problem",
        prompt="How would you frame this as a data science problem — task type, target, unit and horizon?",
        signals=(
            "Names the task type (forecast, classification, ranking, uplift, optimisation, GenAI)",
            "Defines the target variable, the unit of prediction and the horizon",
        ),
        misses=(
            "Says 'build a model' without a target or unit",
            "Uses propensity where the decision needs a causal or uplift framing",
        ),
        keywords=(
            "forecast", "classif", "regression", "ranking", "rank", "uplift", "causal",
            "optimis", "optimiz", "recommend", "rag", "retrieval", "target", "label",
            "granularity", "horizon", "per customer", "per store", "sku",
        ),
        checks=(
            ("task_type", r"\b(forecast\w*|classif\w*|regression|rank\w*|uplift|causal|optimi[sz]\w*|recommend\w*|rag|retrieval|generative|genai|mmm|mix model\w*)\b"),
            ("target_defined", r"\b(target|label|predict\w*|outcome variable|dependent variable)\b"),
            ("unit_or_horizon", r"\b(granularity|horizon|unit|per (customer|store|sku|day|week|user|call|session)|(store|sku|customer)[- ]?(x|×|by)|daily|weekly)\b"),
        ),
    ),
    FrameworkStep(
        id="data",
        order=3,
        title="Data",
        prompt="What data would you need, and what quality or leakage problems do you expect?",
        signals=(
            "Lists concrete internal and external sources with history length",
            "Names data-quality issues and leakage risks",
        ),
        misses=(
            "Generic 'we need data' with no sources",
            "Ignores leakage, missing data or censored labels",
        ),
        keywords=(
            "data", "source", "transaction", "pos", "crm", "history", "weather", "promo",
            "price", "log", "quality", "missing", "leak", "censor", "external", "join",
        ),
        checks=(
            ("sources_named", r"\b(transaction\w*|pos|crm|logs?|weather|promo\w*|pricing|prices?|billing|usage|clickstream|documents?|spend|calendar|holidays?)\b"),
            ("quality_or_leakage", r"\b(leak\w*|missing|quality|censor\w*|bias(ed)?|outliers?|stale|dirty|gaps?)\b"),
        ),
    ),
    FrameworkStep(
        id="approach",
        order=4,
        title="Approach (baseline first)",
        prompt="Walk me through your modelling approach. Where would you start?",
        signals=(
            "Starts with a simple baseline (heuristic, naive or linear) before a stronger model",
            "Justifies the model choice and names key features",
        ),
        misses=(
            "Opens with deep learning without a baseline",
            "No justification or features",
        ),
        keywords=(
            "baseline", "heuristic", "naive", "simple", "benchmark", "lightgbm", "xgboost",
            "gradient boost", "random forest", "logistic", "linear", "bayesian", "feature",
            "two-tower", "collaborative", "t-learner", "x-learner", "embedding", "neural",
            "deep learning",
        ),
        checks=(
            ("baseline_first", r"\b(baseline|heuristic|naive|rule[- ]based|benchmark|moving average|simple model|start simple|popularity)\b"),
            ("model_justified", r"\b(because|since|so that|trade-?off|interpretab\w*|handles?|captures?)\b"),
        ),
    ),
    FrameworkStep(
        id="evaluation",
        order=5,
        title="Evaluation",
        prompt="How would you evaluate it — offline, and then in the business?",
        signals=(
            "Pairs an offline ML metric with a business metric",
            "Uses time-based validation for anything with a time dimension",
            "Proves value with an A/B test, pilot or geo-experiment",
        ),
        misses=(
            "Only reports accuracy or AUC",
            "Random train/test split on time-series data",
            "No pilot or experiment to prove the business impact",
        ),
        keywords=(
            "metric", "mape", "wape", "rmse", "mae", "auc", "precision", "recall", "f1",
            "ndcg", "qini", "groundedness", "backtest", "a/b", "ab test", "pilot",
            "control", "holdout", "out-of-time", "time-based", "experiment",
        ),
        checks=(
            ("ml_metric", r"\b(w?mape|wape|smape|rmse|mae|auc|roc|precision|recall|f1|ndcg|map@k|qini|uplift curve|log[- ]?loss|groundedness|faithfulness|accuracy|bias)\b"),
            ("business_metric", r"\b(revenue|margin|profit|waste|availability|stock-?outs?|conversion|churn rate|retention|handle time|aht|roi|cost per|incremental|basket|sales)\b"),
            ("time_validation", r"\b(time[- ]based|out[- ]of[- ]time|backtest\w*|rolling|walk[- ]forward|temporal|chronolog\w*|time[- ]series (split|cross))\b"),
            ("experiment", r"(\ba/?b\b|\bab test|\bpilot|\bcontrol group|\bcontrol stores?|\btest and control|\brandomi[sz]\w*|\bgeo[- ]?(lift|test|experiment)|\bholdout group|\bcanary)"),
        ),
    ),
    FrameworkStep(
        id="deployment",
        order=6,
        title="Deployment & adoption",
        prompt="How does this reach the people who use it, and how do you keep it working?",
        signals=(
            "Says how predictions reach users (API, dashboard, CRM, ordering system)",
            "Plans retraining, drift monitoring and ownership",
            "Addresses adoption and change management with the end users",
        ),
        misses=(
            "Stops at the model",
            "No monitoring or retraining plan",
            "Ignores whether users will trust or act on the output",
        ),
        keywords=(
            "deploy", "production", "api", "dashboard", "integrat", "monitor", "drift",
            "retrain", "mlops", "adoption", "change management", "training", "trust",
            "handover", "rollout", "feedback loop",
        ),
        checks=(
            ("delivery_channel", r"\b(api|dashboard|crm|integrat\w*|ordering system|app|desktop|batch job|scor\w+ pipeline|deploy\w*)\b"),
            ("monitoring", r"\b(monitor\w*|drift|retrain\w*|mlops|alert\w*|refresh\w*)\b"),
            ("adoption", r"\b(adoption|change management|train(ing)? (the )?(users|staff|agents|managers)|trust|buy-?in|override|human[- ]in[- ]the[- ]loop|feedback loop)\b"),
        ),
    ),
    FrameworkStep(
        id="recommendation",
        order=7,
        title="Recommendation with quantified impact",
        prompt="Give me your 30-second recommendation, with the expected impact.",
        signals=(
            "Gives a crisp summary: problem, approach, expected impact, risks, next steps",
            "Quantifies the impact (volume × improvement × margin)",
        ),
        misses=(
            "Ends without a recommendation",
            "Impact stated as 'significant' with no number",
        ),
        keywords=(
            "recommend", "in summary", "to summarise", "to summarize", "next step",
            "impact", "risk", "roll out", "propose", "worth",
        ),
        checks=(
            ("recommendation_given", r"\b(i (would )?recommend|my recommendation|we should|i propose|next steps?)\b"),
            ("risks_named", r"\b(risks?|caveats?|downside|watch out|assumption)\b"),
        ),
    ),
)

STEP_BY_ID: dict[str, FrameworkStep] = {s.id: s for s in FRAMEWORK_STEPS}


@dataclass(frozen=True)
class BusinessCase:
    id: str
    title: str
    industry: str
    client: str
    prompt: str
    # Revealed only when the candidate asks. Invented practice numbers.
    facts: tuple[tuple[str, str], ...]
    expected_framing: str
    key_data: str
    strong_approach: str
    evaluation: str
    trap: str
    value_sizing: str
    pushbacks: tuple[str, ...]


CASE_BANK: tuple[BusinessCase, ...] = (
    BusinessCase(
        id="grocery_fresh_waste",
        title="Grocery: fresh-food waste and availability",
        industry="Retail",
        client="A European grocery chain",
        prompt=(
            "Our client, a European grocer, throws away 8% of its fresh produce and still "
            "runs out on weekends. The COO asks: how could data science reduce both?"
        ),
        facts=(
            ("Stores", "420 stores across three countries"),
            ("Fresh sales", "€1.2B a year in fresh categories"),
            ("Gross margin on fresh", "about 30%"),
            ("Waste", "8% of fresh volume is written off; target is 5%"),
            ("Availability", "weekend on-shelf availability is 91% vs 97% midweek"),
            ("Assortment", "about 2,500 fresh SKUs per store; shelf life 1–7 days"),
            ("Ordering today", "store managers order daily using a 4-week moving average plus gut feel"),
            ("Data", "3 years of POS by SKU-store-day, deliveries, write-offs, promo calendar, prices"),
        ),
        expected_framing=(
            "Probabilistic demand forecast at SKU × store × day feeding an order-quantity rule "
            "that trades waste cost against stockout cost; KPIs = waste % and availability."
        ),
        key_data="POS, stock and deliveries, write-offs, promos, prices, weather, holidays, shelf life.",
        strong_approach=(
            "Seasonal-naive / moving-average baseline → global LightGBM with lags, promo, price, "
            "calendar and weather; quantile forecasts so order size reflects shelf life and margin."
        ),
        evaluation=(
            "WAPE and bias on a time-based backtest; business: waste %, availability, margin. "
            "Pilot in ~20 stores vs matched control stores for 8 weeks."
        ),
        trap="Random train/test split leaks the future; sales during stockouts understate true demand (censored).",
        value_sizing=(
            "€1.2B fresh sales × 2pp less waste × 70% (cost of goods written off) ≈ €17M/yr, "
            "plus recovered weekend sales from availability."
        ),
        pushbacks=(
            "Store managers don't trust the system — what do you do?",
            "Why not just order less on Mondays?",
            "How do you forecast a SKU launched last week?",
        ),
    ),
    BusinessCase(
        id="beauty_mmm",
        title="Beauty brand: €50M marketing mix",
        industry="Consumer goods",
        client="A global beauty brand",
        prompt=(
            "A beauty brand spends €50M a year on media. The CMO wants to know which channels "
            "actually drive sales and how to split next year's budget."
        ),
        facts=(
            ("Budget split", "TV 40%, paid social 25%, search 15%, influencers 10%, retail media 10%"),
            ("Revenue", "€600M a year, about 70% through retailers"),
            ("Gross margin", "about 65%"),
            ("Data", "3 years of weekly spend by channel and country, sell-out, price, promo, distribution"),
            ("Experiments", "one geo-lift test on paid social last year: +4% sales in test regions"),
            ("Today", "budget is set by last year's split plus agency attribution reports"),
        ),
        expected_framing=(
            "Marketing mix model (Bayesian regression with adstock and saturation) giving ROI and "
            "response curves per channel, then a budget optimiser under constraints."
        ),
        key_data="Weekly spend and impressions by channel, sales, price, promo, distribution, seasonality, competitor activity.",
        strong_approach=(
            "Simple regression baseline → Bayesian MMM (e.g. Meridian, PyMC-Marketing, Robyn) with "
            "adstock and saturation; priors informed by the geo-lift result."
        ),
        evaluation=(
            "Out-of-time holdout fit (MAPE), calibration against lift tests, sensible ROI ranges; "
            "business: incremental revenue and ROI; validate reallocations with new geo tests."
        ),
        trap="Channels move together (collinear), so correlation is not causation; last-click attribution misleads.",
        value_sizing=(
            "Reallocating 15% of budget (€7.5M) from low- to high-ROI channels × 1.0 extra ROI × "
            "65% margin ≈ €5M/yr incremental profit."
        ),
        pushbacks=(
            "The TV agency says your model undervalues TV — how do you respond?",
            "How confident are you in these ROI numbers?",
            "We can't run more experiments this year. Now what?",
        ),
    ),
    BusinessCase(
        id="telecom_churn_uplift",
        title="Telecom: churn with a limited retention budget",
        industry="Telecom",
        client="A mobile operator",
        prompt=(
            "A mobile operator wants to cut churn. A retention offer costs €30 each and the "
            "budget covers only 5% of the customer base. Who should get it?"
        ),
        facts=(
            ("Customer base", "2 million postpaid subscribers"),
            ("Churn", "1.5% a month (about 18% a year)"),
            ("ARPU", "€35 a month; contribution margin about 60%"),
            ("Budget", "100,000 offers at €30 = €3M"),
            ("Past campaign", "last year's offer went to a random 10% sample with a no-offer control group"),
            ("Today", "offers go to customers with a contract ending in the next 60 days"),
        ),
        expected_framing=(
            "Uplift (treatment-effect) modelling: target customers whose churn the offer changes, "
            "not those most likely to churn."
        ),
        key_data="Usage, billing, contract end date, complaints, network quality, device, past campaign treatment and outcome.",
        strong_approach=(
            "Baseline: current contract-end rule and a churn-propensity model → T-learner or "
            "X-learner / uplift trees trained on last year's randomised campaign."
        ),
        evaluation=(
            "Qini / uplift curve offline; business: incremental retention, net revenue after offer "
            "cost; randomised campaign with a control group to confirm."
        ),
        trap="High churn propensity ≠ persuadable; 'sure things' and 'lost causes' waste the budget. Uplift needs randomised data.",
        value_sizing=(
            "100k offers × 5pp extra retention from uplift targeting × €35 × 12 months × 60% "
            "≈ €1.3M/yr over the current rule."
        ),
        pushbacks=(
            "Why not just give the offer to the highest-risk customers?",
            "We don't have randomised data in two countries. What then?",
            "Finance says the offer cannibalises revenue. Is that true?",
        ),
    ),
    BusinessCase(
        id="bank_genai_agent_assist",
        title="Bank: GenAI assistant for service agents",
        industry="Financial services",
        client="A retail bank",
        prompt=(
            "A bank's customer-service agents spend about 6 minutes per call searching internal "
            "policies. Leadership wants a GenAI assistant. How would you approach it?"
        ),
        facts=(
            ("Agents", "1,500 agents"),
            ("Volume", "4 million calls a year; average handle time 11 minutes"),
            ("Agent cost", "about €0.60 per agent-minute"),
            ("Knowledge base", "2,000 policy documents, updated monthly, some contradictory"),
            ("Constraints", "regulated; customer PII must not leave the bank's cloud tenancy"),
            ("Today", "keyword search on an intranet plus asking supervisors"),
        ),
        expected_framing=(
            "Retrieval-augmented generation over policy documents inside the agent desktop, with "
            "citations; KPIs = handle time, first-contact resolution, answer accuracy."
        ),
        key_data="Policy documents with versions, call transcripts or logs, past agent questions, supervisor escalations.",
        strong_approach=(
            "Baseline: better search (BM25) → RAG with chunking, embeddings, hybrid retrieval and "
            "reranking, cited answers, guardrails and PII redaction; human in the loop."
        ),
        evaluation=(
            "Golden Q&A set: retrieval recall, answer accuracy, groundedness, LLM-as-judge with human "
            "spot checks; business: handle time, resolution rate, cost per query; pilot team vs control."
        ),
        trap="Hallucinated policy answers carry regulatory risk; stale or conflicting documents; PII leakage.",
        value_sizing=(
            "4M calls × 2 minutes saved × €0.60 per minute ≈ €4.8M/yr, less roughly €0.02 per query in run cost."
        ),
        pushbacks=(
            "Compliance worries the assistant will invent a policy. How do you prevent it?",
            "Why not fine-tune a model on our documents?",
            "How do you know the time saving is real?",
        ),
    ),
    BusinessCase(
        id="fashion_homepage_personalisation",
        title="Fashion e-commerce: homepage personalisation",
        industry="Retail / e-commerce",
        client="An online fashion retailer",
        prompt=(
            "An online fashion retailer's conversion is flat at 2.1%. They want to personalise the "
            "homepage. How would you do it and prove it works?"
        ),
        facts=(
            ("Traffic", "30 million sessions a year, 65% on mobile"),
            ("Conversion", "2.1% site-wide"),
            ("Basket", "average order value €80; gross margin about 50%"),
            ("Visitors", "40% of sessions are new or not logged in"),
            ("Catalogue", "about 20,000 products; 30% new each season"),
            ("Today", "the same editorial homepage for everyone, refreshed weekly"),
        ),
        expected_framing="Ranking / recommendation problem: order homepage modules and products per visitor.",
        key_data="Clickstream, orders, product attributes and images, returns, visitor segments, inventory.",
        strong_approach=(
            "Popularity by segment as baseline → collaborative filtering or a two-tower model; "
            "content features for cold-start products and anonymous visitors."
        ),
        evaluation=(
            "NDCG / precision@k on a time-based split offline; A/B test on conversion and revenue "
            "per visitor, with returns and diversity as guardrails."
        ),
        trap="Cold start for new visitors and new products; popularity bias; optimising clicks raises returns.",
        value_sizing=(
            "30M sessions × 0.1pp conversion uplift × €80 AOV × 50% margin ≈ €1.2M/yr gross profit."
        ),
        pushbacks=(
            "The brand team wants editorial control of the homepage. How do you handle that?",
            "The A/B test shows more clicks but flat revenue. What happened?",
            "How do you personalise for someone who has never visited?",
        ),
    ),
)

CASE_BY_ID: dict[str, BusinessCase] = {c.id: c for c in CASE_BANK}


def normalize_case_id(case_id: str | None) -> str:
    cid = (case_id or "").strip()
    return cid if cid in CASE_BY_ID else ""


def case_for_session(session: Any) -> BusinessCase | None:
    state = getattr(session, "live_state", None) or {}
    return CASE_BY_ID.get(str(state.get("case_id", "")))


def cases_for_api() -> dict[str, Any]:
    return {
        "framework": [
            {
                "id": s.id,
                "order": s.order,
                "title": s.title,
                "signals": list(s.signals),
                "misses": list(s.misses),
            }
            for s in FRAMEWORK_STEPS
        ],
        "cases": [
            {
                "id": c.id,
                "title": c.title,
                "industry": c.industry,
                "client": c.client,
                "prompt": c.prompt,
                "pushbacks": list(c.pushbacks),
            }
            for c in CASE_BANK
        ],
    }


def case_questions(case: BusinessCase) -> list[dict[str, Any]]:
    """One planned theme per framework step; the first one opens the case."""
    questions: list[dict[str, Any]] = []
    for step in FRAMEWORK_STEPS:
        text = step.prompt
        if step.id == "clarify":
            text = f"{case.prompt} {step.prompt}"
        questions.append(
            {
                "id": step.order - 1,
                "text": text,
                "category": step.id,
                "tip": "Strong answers: " + "; ".join(step.signals[:2]),
            }
        )
    return questions


def _facts_block(case: BusinessCase) -> str:
    return "\n".join(f"- {name}: {value}" for name, value in case.facts)


def case_prompt_block(case: BusinessCase, *, for_interviewer: bool = False) -> str:
    """Case brief and seven-step rubric shared by feedback, summary and live prompts."""
    steps = "\n".join(
        f"{s.order}. {s.title} (id={s.id}) — reward: {'; '.join(s.signals)}. Penalise: {'; '.join(s.misses)}."
        for s in FRAMEWORK_STEPS
    )
    lines = [
        "DATA SCIENCE BUSINESS CASE (consulting-style, Artefact-like):",
        f"Case: {case.title} — client: {case.client}.",
        f"Prompt given to the candidate: {case.prompt}",
        "",
        "CASE FACTS (practice numbers; reveal a fact ONLY when the candidate asks for it or for that kind of information):",
        _facts_block(case),
        "",
        f"Expected framing: {case.expected_framing}",
        f"Key data: {case.key_data}",
        f"Strong approach: {case.strong_approach}",
        f"Evaluation: {case.evaluation}",
        f"Classic trap: {case.trap}",
        f"Reference value sizing: {case.value_sizing}",
        "",
        "SEVEN-STEP FRAMEWORK RUBRIC:",
        steps,
        "Also reward: clarifying questions before solving, stated assumptions, check-ins with the "
        "interviewer, periodic summaries, and impact sized as volume × improvement × margin.",
    ]
    if for_interviewer:
        lines += [
            "",
            "CASE INTERVIEWER CONDUCT:",
            "- Open by presenting the case prompt, then let the candidate drive.",
            "- Answer clarifying questions briefly using ONLY the case facts; if a fact is not listed, say it's unknown and ask them to assume.",
            "- Do not volunteer facts, the framing, or the trap.",
            "- If they skip the baseline, the business metric, time-based validation or a pilot, probe once.",
            "- Use at most one pushback from: " + " | ".join(case.pushbacks),
            "- Before closing, ask for a 30-second recommendation with quantified impact.",
        ]
    return "\n".join(lines)


def case_feedback_rubric(case: BusinessCase, step_id: str = "") -> str:
    """Rubric plus the extra JSON keys the feedback model must return for case answers."""
    focus = ""
    step = STEP_BY_ID.get(step_id)
    if step:
        focus = (
            f"\nTHIS ANSWER targets step {step.order} ({step.title}); weight it most, but score "
            "every step on evidence anywhere in the answer."
        )
    return (
        case_prompt_block(case)
        + focus
        + "\n\nIn addition to the standard keys, return:\n"
        '"framework_steps": [{"step": "<step id>", "score": 0-3, "evidence": "short quote or \'not covered\'"}] '
        "for all seven step ids (0 = absent, 1 = mentioned, 2 = adequate, 3 = consultant-grade),\n"
        '"value_sizing": {"present": true|false, "formula": "the candidate\'s sizing, or empty", '
        '"missing": ["volume"|"improvement"|"margin"]},\n'
        '"clarification_answers": [{"question": "a clarifying question the candidate asked", '
        '"answer": "answer from CASE FACTS only, or \'unknown — state an assumption\'"}].'
    )


def case_summary_block(case: BusinessCase) -> str:
    return (
        case_prompt_block(case)
        + "\n\nIn addition to the standard keys, return framework_steps (all seven step ids, 0-3, "
        "scored on the WHOLE transcript) and value_sizing in the same shape as per-answer feedback."
    )


# ---------------------------------------------------------------------------
# Deterministic detectors
# ---------------------------------------------------------------------------

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")
_NUMBER = re.compile(r"(?:[€$£]\s?\d|\d[\d,.]*\s?(?:%|pp|bn|m\b|k\b|million|billion|thousand|percent|points?)|\d[\d,.]{2,})", re.I)

_VALUE_TERMS: dict[str, re.Pattern[str]] = {
    "volume": re.compile(
        r"\b(sales|revenue|turnover|volume|addressable|customers?|subscribers?|base|stores?|calls?|"
        r"sessions?|visitors?|users?|orders?|units?|budget|spend|agents?|offers?)\b",
        re.I,
    ),
    "improvement": re.compile(
        r"\b(reduc\w*|improv\w*|uplift|lift|increase\w*|decrease\w*|cut|sav(e|ing|ings)|fewer|less|more|"
        r"extra|incremental|gain)\b",
        re.I,
    ),
    "margin": re.compile(
        r"\b(margin|profit|contribution|per (unit|call|minute|customer|order|query)|cost of goods|cogs|"
        r"arpu|aov|order value|value per|each|roi|€\s?\d+(\.\d+)? (a|per))\b|\d\s?%\s?(of\s)?(cost|margin)",
        re.I,
    ),
}
_MULTIPLY = re.compile(r"(×|\*|\btimes\b|\bmultipl\w*|\d\s?x\s?\d|\bx\s?€)", re.I)
_MONEY_RESULT = re.compile(r"([€$£]\s?\d[\d,.]*\s?(k|m|bn|million|billion)?|\d[\d,.]*\s?(k|m|bn|million|billion)\s?(euros?|dollars?|pounds?))", re.I)

_SIGNAL_PATTERNS: dict[str, re.Pattern[str]] = {
    "check_ins": re.compile(
        r"(does (that|this)( \w+)? (make sense|sound|work)|shall i|should i (go|continue|move|dive)|"
        r"is that (ok|okay|fine|right)|are we aligned|"
        r"are you happy|would you like me to|any questions (so far|before)|before i (go on|move on|continue)|"
        r"do you want me to|is this the (right|kind)|happy for me to|can i (go ahead|proceed))",
        re.I,
    ),
    "summaries": re.compile(
        r"(to summari[sz]e|in summary|to recap|recapping|so far (we|i)('ve| have)|to sum up|to conclude|"
        r"in short|bottom line|putting it together|let me summari[sz]e|quick summary)",
        re.I,
    ),
    "assumptions": re.compile(
        r"(\bassum\w*|let'?s say|suppose|i'?ll take|ballpark|for simplicity|hypothes\w*|rule of thumb|"
        r"i'?d estimate|roughly|order of magnitude)",
        re.I,
    ),
    "signposting": re.compile(
        r"(\bfirst(ly)?,|\bsecond(ly)?,|\bthird(ly)?,|\bfinally,|\bstep (one|two|three|\d)|\bthree (things|areas|parts)|"
        r"\bmy structure|\bi'?ll (cover|structure|break))",
        re.I,
    ),
}
_CLARIFY_QUESTION = re.compile(
    r"\b(what|who|how|which|when|where|why|do (we|they|you)|does|did|is (it|there|the)|are (there|we|they)|"
    r"can (you|i|we)|could (you|i|we)|would (you|they))\b",
    re.I,
)


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_SPLIT.split(text or "") if s.strip()]


def _snippet(text: str, limit: int = 120) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def structure_signals(text: str, *, clarification_turns: int = 0) -> dict[str, Any]:
    """Count consulting-structure habits: clarifying questions, check-ins, summaries, assumptions."""
    sentences = _sentences(text)
    result: dict[str, Any] = {}
    check_in_sentences: set[int] = set()
    for name, pattern in _SIGNAL_PATTERNS.items():
        hits = [i for i, s in enumerate(sentences) if pattern.search(s)]
        if name == "check_ins":
            check_in_sentences = set(hits)
        result[name] = {"count": len(hits), "examples": [_snippet(sentences[i]) for i in hits[:2]]}

    clarifying = [
        i
        for i, s in enumerate(sentences)
        if s.endswith("?") and i not in check_in_sentences and _CLARIFY_QUESTION.search(s)
    ]
    result["clarifying_questions"] = {
        "count": len(clarifying) + clarification_turns,
        "examples": [_snippet(sentences[i]) for i in clarifying[:2]],
    }
    return result


def value_sizing_check(text: str) -> dict[str, Any]:
    """Look for impact = volume × improvement × margin, in sentences that carry numbers."""
    numeric = [s for s in _sentences(text) if _NUMBER.search(s)]
    blob = " ".join(numeric)
    terms = {name: bool(pattern.search(blob)) for name, pattern in _VALUE_TERMS.items()}
    missing = [name for name, ok in terms.items() if not ok]
    has_money = bool(_MONEY_RESULT.search(blob))
    has_multiply = bool(_MULTIPLY.search(blob))
    present = bool(numeric) and has_money and len(missing) <= 1
    complete = present and not missing
    evidence = ""
    for s in numeric:
        if _MONEY_RESULT.search(s) and (_MULTIPLY.search(s) or sum(p.search(s) is not None for p in _VALUE_TERMS.values()) >= 2):
            evidence = _snippet(s, 160)
            break
    if complete:
        status = "complete"
    elif present:
        status = "partial"
    else:
        status = "missing"
    return {
        "status": status,
        "present": present,
        "complete": complete,
        "terms": terms,
        "missing": missing,
        "shows_arithmetic": has_multiply,
        "evidence": evidence,
    }


def framework_coverage(text: str) -> list[dict[str, Any]]:
    """Heuristic 0-3 score per step from keyword hits and named sub-checks."""
    lowered = (text or "").lower()
    out: list[dict[str, Any]] = []
    for step in FRAMEWORK_STEPS:
        hits = sorted({kw for kw in step.keywords if kw in lowered})
        checks = {name: bool(re.search(pattern, lowered, re.I)) for name, pattern in step.checks}
        passed = sum(checks.values())
        if not hits and not passed:
            score = 0
        elif checks:
            score = max(1, round(STEP_MAX_SCORE * passed / len(checks)))
        else:
            score = min(STEP_MAX_SCORE, len(hits))
        out.append(
            {
                "step": step.id,
                "title": step.title,
                "heuristic_score": score,
                "checks": checks,
                "keywords": hits[:6],
            }
        )
    return out


def _coerce_step_scores(raw: Any) -> dict[str, dict[str, Any]]:
    scores: dict[str, dict[str, Any]] = {}
    if not isinstance(raw, list):
        return scores
    for item in raw:
        if not isinstance(item, dict):
            continue
        sid = str(item.get("step", "")).strip()
        if sid not in STEP_BY_ID:
            continue
        try:
            value = max(0, min(STEP_MAX_SCORE, int(round(float(item.get("score", 0))))))
        except (TypeError, ValueError):
            continue
        scores[sid] = {"score": value, "evidence": str(item.get("evidence", ""))[:300]}
    return scores


def best_step_scores(*step_lists: Any) -> list[dict[str, Any]]:
    """Keep each step's highest score across several judgements (answers or turns)."""
    best: dict[str, dict[str, Any]] = {}
    for raw in step_lists:
        for sid, item in _coerce_step_scores(raw).items():
            if sid not in best or item["score"] > best[sid]["score"]:
                best[sid] = item
    return [{"step": sid, **item} for sid, item in best.items()]


_CHECK_FLAGS = {
    ("approach", "baseline_first"): "No baseline before the main model.",
    ("evaluation", "ml_metric"): "No offline ML metric named.",
    ("evaluation", "business_metric"): "No business metric tied to the model.",
    ("evaluation", "time_validation"): "No time-based validation (random splits leak the future).",
    ("evaluation", "experiment"): "No A/B test, pilot or control group to prove value.",
    ("deployment", "monitoring"): "No monitoring or retraining plan.",
    ("deployment", "adoption"): "Adoption and change management not addressed.",
    ("clarify", "baseline_today"): "Never asked how the problem is handled today.",
}


def analyse_case_text(
    text: str,
    llm_steps: Any = None,
    *,
    clarification_turns: int = 0,
    llm_value_sizing: Any = None,
    steps_due: int | None = None,
) -> dict[str, Any]:
    """Merge LLM step scores (preferred) with deterministic coverage and hard flags.

    ``steps_due`` limits judgement to the steps reached so far in a step-by-step
    walk-through; later steps are reported (with any early credit) but never
    flagged or counted against the score.
    """
    due = len(FRAMEWORK_STEPS) if steps_due is None else max(1, min(len(FRAMEWORK_STEPS), steps_due))
    coverage = framework_coverage(text)
    llm = _coerce_step_scores(llm_steps)
    steps: list[dict[str, Any]] = []
    flags: list[str] = []
    for row in coverage:
        sid = row["step"]
        is_due = STEP_BY_ID[sid].order <= due
        judged = llm.get(sid)
        score = judged["score"] if judged else row["heuristic_score"]
        steps.append(
            {
                **row,
                "score": score,
                "due": is_due,
                "source": "llm" if judged else "heuristic",
                "evidence": (judged or {}).get("evidence", ""),
            }
        )
        if not is_due:
            continue
        if score == 0:
            flags.append(f"Step {STEP_BY_ID[sid].order} ({STEP_BY_ID[sid].title}) not covered.")
        for (step_id, check), message in _CHECK_FLAGS.items():
            if score and step_id == sid and not row["checks"].get(check, True):
                flags.append(message)

    sizing = value_sizing_check(text)
    if isinstance(llm_value_sizing, dict) and llm_value_sizing.get("formula"):
        sizing["llm_formula"] = str(llm_value_sizing.get("formula"))[:300]
    # Sizing belongs to the recommendation; before then, only report it if it's already there.
    sizing_due = due >= STEP_BY_ID["recommendation"].order
    if sizing["status"] == "missing" and sizing_due:
        flags.insert(0, "Missing value sizing: quantify impact as volume × improvement × margin.")
    elif sizing["status"] == "partial":
        flags.insert(0, "Value sizing incomplete — missing " + ", ".join(sizing["missing"]) + ".")
    sizing["due"] = sizing_due

    signals = structure_signals(text, clarification_turns=clarification_turns)
    total = sum(s["score"] for s in steps if s["due"])
    return {
        "steps": steps,
        "steps_due": due,
        "framework_score": round(total / (STEP_MAX_SCORE * due) * 10, 1),
        "value_sizing": sizing,
        "structure_signals": signals,
        "structure_feedback": structure_feedback(signals),
        "flags": flags[:8],
    }


def structure_feedback(signals: dict[str, Any]) -> list[str]:
    tips: list[str] = []
    if signals["clarifying_questions"]["count"] < 2:
        tips.append("Ask at least two clarifying questions (objective, KPI, today's process) before solving.")
    if signals["assumptions"]["count"] == 0:
        tips.append("State your assumptions out loud, with round numbers.")
    if signals["check_ins"]["count"] == 0:
        tips.append("Check in with the interviewer every few minutes (\"Does that structure work for you?\").")
    if signals["summaries"]["count"] == 0:
        tips.append("Summarise where you are before moving to the next step, and at the end.")
    if signals["signposting"]["count"] == 0:
        tips.append("Signpost your structure (\"I'll cover three things: …\").")
    return tips


def pace_feedback(wpm: float | int | None) -> str:
    if not wpm:
        return "Pace not measured — needs audio or a timestamped transcript."
    low, high = CASE_PACE_BAND
    if wpm < low:
        return f"{round(wpm)} wpm is slower than the {low}–{high} wpm consulting band; tighten sentences and pauses."
    if wpm > high:
        return f"{round(wpm)} wpm is faster than the {low}–{high} wpm band; slow down when you give numbers."
    return f"{round(wpm)} wpm is within the {low}–{high} wpm consulting band."


def delivery_rollup(deliveries: list[dict[str, Any]]) -> dict[str, Any]:
    """Session-level filler and pace view across spoken answers."""
    spoken = [d for d in deliveries if isinstance(d, dict) and d.get("word_count")]
    if not spoken:
        return {}
    words = sum(int(d.get("word_count", 0)) for d in spoken)
    fillers = sum(int(d.get("filler_count", 0)) for d in spoken)
    timed = [d for d in spoken if d.get("words_per_minute")]
    seconds = sum(float(d.get("duration_seconds", 0)) for d in timed)
    timed_words = sum(int(d.get("word_count", 0)) for d in timed)
    wpm = round(timed_words / seconds * 60) if seconds > 0 else 0
    breakdown: dict[str, int] = {}
    for d in spoken:
        for word, count in (d.get("filler_breakdown") or {}).items():
            breakdown[word] = breakdown.get(word, 0) + int(count)
    top = sorted(breakdown.items(), key=lambda kv: kv[1], reverse=True)[:3]
    rate = round(fillers / words * 100) if words else 0
    tips = [pace_feedback(wpm)]
    if rate > 5:
        tips.append(
            f"{rate} fillers per 100 words (most: {', '.join(w for w, _ in top)}) — replace them with a silent pause."
        )
    elif fillers:
        tips.append(f"Filler use is low ({rate} per 100 words).")
    return {
        "answers": len(spoken),
        "words_per_minute": wpm,
        "filler_rate_per_100": rate,
        "top_fillers": [{"word": w, "count": c} for w, c in top],
        "feedback": tips,
    }


def build_case_scorecard(
    case: BusinessCase,
    candidate_texts: list[str],
    *,
    per_turn_steps: list[Any] | None = None,
    summary_steps: Any = None,
    summary_value_sizing: Any = None,
    deliveries: list[dict[str, Any]] | None = None,
    clarification_turns: int = 0,
) -> dict[str, Any]:
    """Session scorecard: best evidence per step across the whole case."""
    llm_best = _coerce_step_scores(best_step_scores(*(per_turn_steps or [])))
    # A whole-transcript judgement (live mode) beats the per-turn maxima.
    llm_best.update(_coerce_step_scores(summary_steps))
    merged_steps = [{"step": sid, **item} for sid, item in llm_best.items()]

    analysis = analyse_case_text(
        "\n".join(t for t in candidate_texts if t),
        merged_steps or None,
        clarification_turns=clarification_turns,
        llm_value_sizing=summary_value_sizing,
    )
    analysis["case_id"] = case.id
    analysis["case_title"] = case.title
    analysis["reference_value_sizing"] = case.value_sizing
    analysis["trap"] = case.trap
    rollup = delivery_rollup(deliveries or [])
    if rollup:
        analysis["delivery"] = rollup
    return analysis


_TIMESTAMP = re.compile(r"\[?\(?\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\.\d+)?\b\)?\]?")
_SPEAKER = re.compile(r"^\s*([A-Za-z][\w .'-]{0,30}?)\s*:\s+(.*)$")
_INTERVIEWER_LABELS = frozenset(
    {"interviewer", "partner", "manager", "case partner", "them", "q", "int", "artefact", "consultant", "assistant"}
)


def _timestamp_seconds(match: re.Match[str]) -> int:
    hours = int(match.group(1) or 0)
    return hours * 3600 + int(match.group(2)) * 60 + int(match.group(3))


def split_transcript(transcript: str) -> dict[str, Any]:
    """Separate candidate speech from interviewer lines and time the candidate's own lines.

    A timestamped candidate line is timed until the next timestamp, so interviewer
    turns don't dilute the pace; untimed candidate words are scaled in at the same rate.
    """
    candidate: list[str] = []
    interviewer: list[str] = []
    # (timestamp or None, is_candidate, word count) per spoken line, in order.
    timeline: list[tuple[int | None, bool, int]] = []
    labelled = False
    for raw in (transcript or "").splitlines():
        stamp_match = _TIMESTAMP.search(raw)
        stamp = _timestamp_seconds(stamp_match) if stamp_match else None
        line = _TIMESTAMP.sub("", raw).strip(" -\t")
        if not line:
            continue
        match = _SPEAKER.match(line)
        if match:
            labelled = True
            speaker, said = match.group(1).strip().lower(), match.group(2).strip()
            is_candidate = speaker not in _INTERVIEWER_LABELS
        elif labelled and interviewer and not candidate:
            said, is_candidate = line, False
        else:
            said, is_candidate = line, True
        (candidate if is_candidate else interviewer).append(said)
        timeline.append((stamp, is_candidate, len(said.split())))

    timed_seconds = 0
    timed_words = 0
    for i, (stamp, is_candidate, words) in enumerate(timeline):
        nxt = next((t for t, _, _ in timeline[i + 1 :] if t is not None), None)
        if is_candidate and stamp is not None and nxt is not None and nxt > stamp:
            timed_seconds += nxt - stamp
            timed_words += words
    candidate_words = sum(w for _, is_candidate, w in timeline if is_candidate)
    duration = 0.0
    if timed_seconds and timed_words:
        duration = timed_seconds * candidate_words / timed_words
    return {
        "candidate_text": "\n".join(candidate),
        "interviewer_lines": len(interviewer),
        "timestamp_duration_seconds": round(duration, 1),
    }


def analyze_case_transcript(
    case: BusinessCase,
    transcript: str,
    duration_seconds: float | None = None,
) -> dict[str, Any]:
    """Score a pasted case transcript: framework, value sizing, structure and delivery."""
    from app.services.speech import analyze_delivery

    parts = split_transcript(transcript)
    text = parts["candidate_text"]
    if duration_seconds and duration_seconds > 0:
        duration, source = float(duration_seconds), "provided"
    elif parts["timestamp_duration_seconds"] > 0:
        duration, source = float(parts["timestamp_duration_seconds"]), "timestamps"
    else:
        duration, source = 0.0, "none"
    delivery = analyze_delivery(text, duration)
    card = build_case_scorecard(case, [text], deliveries=[delivery])
    return {
        "case_scorecard": card,
        "delivery": delivery,
        "duration_source": source,
        "candidate_word_count": delivery.get("word_count", 0),
        "interviewer_lines": parts["interviewer_lines"],
        "markdown": case_scorecard_markdown(card, heading="## Case transcript scorecard"),
    }


def case_scorecard_markdown(card: dict[str, Any], *, heading: str = "### Case framework") -> str:
    if not card:
        return ""
    due = card.get("steps_due") or len(FRAMEWORK_STEPS)
    scope = f" (steps 1–{due} so far)" if due < len(FRAMEWORK_STEPS) else ""
    lines = [f"{heading} · **{card.get('framework_score', '—')}/10**{scope}", ""]
    lines.append("| Step | Score | Evidence |")
    lines.append("| --- | --- | --- |")
    for step in card.get("steps", []):
        meta = STEP_BY_ID.get(step.get("step", ""))
        title = meta.title if meta else step.get("step", "")
        order = f"{meta.order}. " if meta else ""
        evidence = step.get("evidence") or ", ".join(step.get("keywords") or []) or "not covered"
        evidence = evidence.replace("|", "/")
        score = f"{step.get('score', 0)}/{STEP_MAX_SCORE}"
        if step.get("due") is False:
            if not step.get("score"):
                lines.append(f"| {order}{title} | — | later |")
                continue
            score += " (early)"
        lines.append(f"| {order}{title} | {score} | {evidence[:90]} |")
    lines.append("")
    sizing = card.get("value_sizing") or {}
    if sizing.get("status") == "complete":
        lines.append(f"**Value sizing:** complete — {sizing.get('evidence') or 'volume × improvement × margin'}")
    elif sizing.get("status") == "partial":
        lines.append(f"**Value sizing:** partial — missing {', '.join(sizing.get('missing') or [])}.")
    elif sizing.get("due") is False:
        lines.append("**Value sizing:** not yet — size impact as volume × improvement × margin in your recommendation.")
    else:
        lines.append("**Value sizing:** ⚠ missing — size impact as volume × improvement × margin.")
    signals = card.get("structure_signals") or {}
    if signals:
        lines.append(
            "**Structure signals:** "
            f"{signals.get('clarifying_questions', {}).get('count', 0)} clarifying questions · "
            f"{signals.get('check_ins', {}).get('count', 0)} check-ins · "
            f"{signals.get('summaries', {}).get('count', 0)} summaries · "
            f"{signals.get('assumptions', {}).get('count', 0)} assumptions stated"
        )
    flags = card.get("flags") or []
    if flags:
        lines.append("")
        lines.append("**Flags**")
        lines.extend(f"- {f}" for f in flags)
    tips = card.get("structure_feedback") or []
    if tips:
        lines.append("")
        lines.append("**Structure habits**")
        lines.extend(f"- {t}" for t in tips)
    delivery = card.get("delivery") or {}
    if delivery.get("feedback"):
        lines.append("")
        lines.append("**Delivery**")
        lines.extend(f"- {t}" for t in delivery["feedback"])
    return "\n".join(lines).strip()
