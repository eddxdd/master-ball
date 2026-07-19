"""Tests for the /chat REST + WebSocket endpoints (app/routers/chat.py). The
underlying agent's own routing/tool-calling logic is covered by
tests/test_agent_graph.py against a fake LLM — these tests are scoped to the
HTTP/WS plumbing: request/response shape, the 503-when-unconfigured path, and
that streamed events reach the client in order.
"""

import pytest
from fastapi.testclient import TestClient

from app.agent.graph import AgentAnswer
from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_chat_returns_503_when_no_provider_keys_are_configured(client: TestClient):
    # No ANTHROPIC_API_KEY/OPENAI_API_KEY set in this test environment (see
    # Backend/.env.example) — this is the intended honest failure mode rather
    # than a silently mocked response, per app/agent/llm.py's docstring.
    response = client.post("/chat", json={"message": "hello"})
    assert response.status_code == 503
    assert (
        "OPENAI_API_KEY" in response.json()["detail"]
        or "ANTHROPIC_API_KEY" in response.json()["detail"]
    )


def test_chat_returns_the_agents_answer_shape(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    seen: dict = {}

    async def fake_run_agent(db, query, **kwargs):  # noqa: ARG001 — matches run_agent's signature
        seen["query"] = query
        seen["history"] = kwargs.get("history")
        return AgentAnswer(
            answer=f"Echo: {query}",
            needs_clarification=False,
            citations=[],
            turn_id="turn-abc",
            quality_warnings=[],
        )

    monkeypatch.setattr("app.routers.chat.run_agent", fake_run_agent)

    response = client.post(
        "/chat",
        json={
            "message": "link that",
            "history": [
                {"role": "user", "content": "Ludicolo please"},
                {"role": "assistant", "content": "Sure — Water/Grass."},
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body == {
        "answer": "Echo: link that",
        "needs_clarification": False,
        "citations": [],
        "turn_id": "turn-abc",
        "quality_warnings": [],
    }
    assert seen["history"] == [
        {"role": "user", "content": "Ludicolo please"},
        {"role": "assistant", "content": "Sure — Water/Grass."},
    ]


def test_chat_ws_streams_tokens_then_a_done_event(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    async def fake_stream_agent(db, query, **kwargs):  # noqa: ARG001
        for token in ["Hello", " there"]:
            yield {"type": "token", "content": token}
        yield {
            "type": "done",
            "answer": "Hello there",
            "needs_clarification": False,
            "citations": [],
            "turn_id": "turn-ws",
            "quality_warnings": [],
        }

    monkeypatch.setattr("app.routers.chat.stream_agent", fake_stream_agent)

    with client.websocket_connect("/chat/ws") as ws:
        ws.send_json({"message": "hi"})
        events = [ws.receive_json() for _ in range(3)]

    assert events[0] == {"type": "token", "content": "Hello"}
    assert events[1] == {"type": "token", "content": " there"}
    assert events[2]["type"] == "done"
    assert events[2]["answer"] == "Hello there"
    assert events[2]["turn_id"] == "turn-ws"


def test_chat_feedback_persists(client: TestClient):
    response = client.post(
        "/chat/feedback",
        json={
            "turn_id": "turn-1",
            "rating": "down",
            "message": "What beats Great Tusk?",
            "answer": "Something wrong",
            "comment": "Missed the meta",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["turn_id"] == "turn-1"
    assert body["rating"] == "down"
    assert body["id"] > 0


def test_chat_ws_rejects_an_empty_message(client: TestClient):
    with client.websocket_connect("/chat/ws") as ws:
        ws.send_json({"message": "   "})
        event = ws.receive_json()

    assert event == {"type": "error", "detail": "Empty message."}
