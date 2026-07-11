"""Curated professional keyword vocabulary for offline heuristic extraction.

Includes data science/AI plus change management, leadership, and general business terms.
Multi-word phrases are matched first.
"""

SKILLS: list[str] = [
    # Change management / transformation
    "change management", "organizational change", "transformation", "adkar", "prosci",
    "stakeholder engagement", "stakeholder management", "sponsorship", "change readiness",
    "communications plan", "training and enablement", "enablement", "org design",
    "organizational design", "culture change", "operating model", "business transformation",
    "program management", "portfolio management", "governance", "change impact analysis",
    "resistance management", "executive coaching", "workshop facilitation", "facilitation",
    # Leadership / general professional
    "leadership", "cross-functional", "influence", "executive stakeholder", "strategy",
    "project management", "pmp", "prince2", "lean", "six sigma", "process improvement",
    "business analysis", "requirements gathering", "stakeholder alignment", "negotiation",
    "presentation skills", "public speaking", "coaching", "mentoring", "team leadership",
    "budget management", "vendor management", "risk management", "compliance",
    # Languages
    "python", "r", "sql", "scala", "java", "c++", "julia", "bash", "go", "rust",
    # ML / DL
    "machine learning", "deep learning", "reinforcement learning", "nlp",
    "natural language processing", "computer vision", "time series",
    "recommender systems", "anomaly detection", "forecasting",
    "supervised learning", "unsupervised learning", "feature engineering",
    "model deployment", "mlops", "model monitoring", "a/b testing",
    "experimentation", "causal inference", "statistics", "bayesian",
    "hypothesis testing", "regression", "classification", "clustering",
    "gradient boosting", "xgboost", "lightgbm", "random forest",
    # LLM / GenAI
    "llm", "large language models", "generative ai", "genai", "rag",
    "retrieval augmented generation", "prompt engineering", "fine-tuning",
    "embeddings", "vector database", "langchain", "llamaindex", "openai",
    "hugging face", "transformers", "agents", "semantic search",
    # Frameworks / libs
    "pytorch", "tensorflow", "keras", "scikit-learn", "sklearn", "pandas",
    "numpy", "scipy", "matplotlib", "seaborn", "plotly", "spark", "pyspark",
    "dask", "ray", "jax", "onnx",
    # Data / infra
    "airflow", "dbt", "kafka", "snowflake", "databricks", "bigquery",
    "redshift", "postgres", "postgresql", "mysql", "mongodb", "redis",
    "elasticsearch", "hadoop", "hive", "etl", "data pipeline", "data warehouse",
    "feature store", "data lake",
    # Cloud / devops
    "aws", "gcp", "azure", "sagemaker", "vertex ai", "docker", "kubernetes",
    "terraform", "ci/cd", "github actions", "mlflow", "weights & biases",
    "wandb", "kubeflow", "fastapi", "flask", "grpc", "rest api",
    # BI / viz
    "tableau", "power bi", "looker", "dashboards", "streamlit",
    # Practices
    "git", "agile", "scrum", "kanban", "unit testing", "data visualization", "storytelling",
    "stakeholder management",
]

# Longer phrases first so multi-word matches take precedence.
SKILLS_SORTED = sorted(set(SKILLS), key=lambda s: (-len(s.split()), -len(s)))

# Map common variants to a canonical form for cleaner matching.
ALIASES = {
    "sklearn": "scikit-learn",
    "postgresql": "postgres",
    "genai": "generative ai",
    "wandb": "weights & biases",
    "natural language processing": "nlp",
    "retrieval augmented generation": "rag",
    "large language models": "llm",
    "organizational change": "change management",
    "training and enablement": "enablement",
}
