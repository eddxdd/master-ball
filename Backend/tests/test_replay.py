"""Integration tests for /replay/* (app/routers/replay.py) — HTTP plumbing
around the deterministic parser (app/tools/replay_parser.py, unit-tested on
its own in test_replay_parser.py) and the 503-when-unconfigured path for the
AI postmortem endpoint (mirrors test_sessions.py's post-loss-review tests).
"""

import pytest
from fastapi.testclient import TestClient

from app.agent.graph import AgentAnswer
from app.main import app

SAMPLE_LOG = """
|player|p1|Ash|red|
|player|p2|Gary|blue|
|tier|[Gen 9] OU
|switch|p1a: Landorus-Therian|Landorus-Therian, M|100/100
|switch|p2a: Corviknight|Corviknight, F|100/100
|turn|1
|move|p1a: Landorus-Therian|Earthquake|p2a: Corviknight
|-immune|p2a: Corviknight
|win|Ash
""".strip()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_parse_replay_from_raw_log(client: TestClient):
    response = client.post("/replay/parse", json={"log": SAMPLE_LOG})
    assert response.status_code == 200
    body = response.json()
    assert body["players"] == {"p1": "Ash", "p2": "Gary"}
    assert body["winner"] == "Ash"
    assert body["turn_count"] == 1


def test_parse_replay_requires_log_or_replay_id(client: TestClient):
    response = client.post("/replay/parse", json={})
    assert response.status_code == 400


def test_parse_replay_rejects_both_log_and_replay_id(client: TestClient):
    response = client.post("/replay/parse", json={"log": SAMPLE_LOG, "replay_id": "gen9ou-123"})
    assert response.status_code == 400


def test_replay_coach_returns_503_when_no_provider_keys_configured(client: TestClient):
    response = client.post("/replay/coach", json={"log": SAMPLE_LOG})
    assert response.status_code == 503


def test_replay_coach_returns_the_agents_answer_when_configured(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
):
    async def fake_run_agent(db, query):  # noqa: ARG001
        assert "Ash" in query or "Gary" in query
        return AgentAnswer(
            answer="Turn 1 was decisive.",
            needs_clarification=False,
            citations=[],
            turn_id="replay-turn",
            quality_warnings=[],
        )

    monkeypatch.setattr("app.routers.replay.run_agent", fake_run_agent)

    response = client.post("/replay/coach", json={"log": SAMPLE_LOG})
    assert response.status_code == 200
    assert response.json()["answer"] == "Turn 1 was decisive."
