"""Tiny hand-built eval set of (resume, job description) pairs.

Real evals would use a larger, labeled corpus; this is enough to demonstrate
the methodology and to guard against regressions in the tailoring pipeline.
"""

CASES = [
    {
        "id": "ds_churn",
        "resume": """Maria Lopez
maria@example.com | github.com/mlopez
Data Scientist with 5 years building predictive models in Python.
Skills: Python, pandas, scikit-learn, SQL, XGBoost, Tableau
- Built a churn model (XGBoost) improving retention 12%.
- Ran A/B tests to validate pricing changes.""",
        "jd": """Machine Learning Engineer
We want Python, scikit-learn, XGBoost, MLOps, Docker, AWS, SQL,
feature engineering, model deployment, and A/B testing experience.""",
    },
    {
        "id": "ai_llm",
        "resume": """Sam Patel
sam@example.com
AI Engineer, 3 years. Skills: Python, PyTorch, Hugging Face, LLM, RAG,
embeddings, FastAPI. Shipped a RAG chatbot with a vector database.""",
        "jd": """Senior AI Engineer
Must have: Python, PyTorch, LLM, RAG, embeddings, vector database,
prompt engineering, LangChain, Docker, Kubernetes, AWS.""",
    },
    {
        "id": "analyst_stretch",
        "resume": """Chen Wei
chen@example.com
Data Analyst, 2 years. Skills: SQL, Excel, Tableau, Python basics.
Built dashboards and weekly reporting for marketing.""",
        "jd": """Data Scientist (ML)
Need Python, machine learning, scikit-learn, statistics, deep learning,
PyTorch, SQL, experimentation, causal inference.""",
    },
]
