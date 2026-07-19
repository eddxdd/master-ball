"""LLM provider wiring for the agent graph — see Docs/tech-stack.md's "Cloud
and model-provider decision, revisited" for why OpenAI routes the cheap/fast
classification step and Claude does the expensive synthesis step.

Each model is constructed with explicit timeouts + bounded retries. Synthesis
also exposes an OpenAI fallback model when OPENAI_API_KEY is set — the graph
uses app/agent/reliability.py to fail over after circuit-breaker trips /
provider errors. Missing keys still raise MissingProviderKeyError (clear 503),
never a mocked answer.
"""

from langchain_core.language_models import BaseChatModel

from app.core.config import get_settings

ROUTER_MODEL = "gpt-5-mini"
SYNTHESIZER_MODEL = "claude-sonnet-4-5"
SYNTHESIZER_FALLBACK_MODEL = "gpt-4.1"


class MissingProviderKeyError(RuntimeError):
    def __init__(self, provider: str, env_var: str):
        super().__init__(
            f"{provider} isn't configured — set {env_var} to enable the AI agent. "
            "See Backend/.env.example."
        )
        self.provider = provider
        self.env_var = env_var


def get_router_llm() -> BaseChatModel:
    settings = get_settings()
    if not settings.openai_api_key:
        raise MissingProviderKeyError("OpenAI", "OPENAI_API_KEY")
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=ROUTER_MODEL,
        api_key=settings.openai_api_key,
        temperature=0,
        timeout=settings.llm_router_timeout_s,
        max_retries=settings.llm_max_retries,
    )


def get_synthesizer_llm() -> BaseChatModel:
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise MissingProviderKeyError("Anthropic", "ANTHROPIC_API_KEY")
    from langchain_anthropic import ChatAnthropic

    return ChatAnthropic(
        model_name=SYNTHESIZER_MODEL,
        api_key=settings.anthropic_api_key,
        temperature=0.3,
        timeout=settings.llm_synthesizer_timeout_s,
        max_retries=settings.llm_max_retries,
    )


def get_synthesizer_fallback_llm() -> BaseChatModel | None:
    """OpenAI synthesis fallback — None when unset or fallback disabled."""
    settings = get_settings()
    if not settings.llm_fallback_enabled or not settings.openai_api_key:
        return None
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=SYNTHESIZER_FALLBACK_MODEL,
        api_key=settings.openai_api_key,
        temperature=0.3,
        timeout=settings.llm_synthesizer_timeout_s,
        max_retries=settings.llm_max_retries,
    )
