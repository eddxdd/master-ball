"""The Phase 2 conversational agent — LangGraph router -> tool_calls ->
synthesizer graph. See Docs/ai-agents-and-rag.md section 1 and
Docs/backend/README.md's "AI agent (Phase 2)" section.
"""

from app.agent.graph import AgentAnswer, AgentUnavailableError, run_agent

__all__ = ["AgentAnswer", "AgentUnavailableError", "run_agent"]
