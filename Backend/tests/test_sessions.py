"""Integration tests for /sessions/* (app/routers/sessions.py) — battle-log
HTTP plumbing, push subscription CRUD, and the post-loss-review endpoint's
503-when-unconfigured path (its actual agent behavior is covered by
tests/test_agent_graph.py). The tilt-detection *logic* itself is covered by
tests/test_battle_log.py; these tests are scoped to request/response shape.
"""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_post_battle_log_returns_entry_and_tilt_check(client: TestClient):
    client_id = str(uuid4())

    response = client.post(
        "/sessions/battle-log", json={"client_id": client_id, "result": "loss", "note": "got swept"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["entry"]["result"] == "loss"
    assert body["entry"]["note"] == "got swept"
    assert body["tilt_check"]["consecutive_losses"] == 1
    assert body["tilt_check"]["nudge"] is False
    assert body["push_sent"] is False  # no subscription exists for this client_id


def test_two_losses_in_a_row_flags_a_nudge_over_http(client: TestClient):
    client_id = str(uuid4())

    client.post("/sessions/battle-log", json={"client_id": client_id, "result": "loss"})
    response = client.post("/sessions/battle-log", json={"client_id": client_id, "result": "loss"})

    body = response.json()
    assert body["tilt_check"]["nudge"] is True
    assert body["tilt_check"]["message"] is not None
    # No VAPID keys configured in this test environment (Backend/.env.example
    # ships them blank) and no subscription exists either — push_sent must
    # honestly reflect that rather than claim success.
    assert body["push_sent"] is False


def test_get_battle_log_lists_entries_most_recent_first(client: TestClient):
    client_id = str(uuid4())
    client.post(
        "/sessions/battle-log", json={"client_id": client_id, "result": "win", "note": "first"}
    )
    client.post(
        "/sessions/battle-log", json={"client_id": client_id, "result": "loss", "note": "second"}
    )

    response = client.get("/sessions/battle-log", params={"client_id": client_id})
    assert response.status_code == 200
    notes = [e["note"] for e in response.json()]
    assert notes == ["second", "first"]


def test_vapid_public_key_is_none_when_not_configured(client: TestClient):
    response = client.get("/sessions/push/vapid-public-key")
    assert response.status_code == 200
    assert response.json() == {"public_key": None}


def test_push_subscribe_and_unsubscribe_round_trip(client: TestClient):
    client_id = str(uuid4())

    subscribe = client.post(
        "/sessions/push/subscribe",
        json={
            "client_id": client_id,
            "endpoint": "https://push.example.com/some-endpoint",
            "keys": {"p256dh": "fake-p256dh", "auth": "fake-auth"},
        },
    )
    assert subscribe.status_code == 204

    unsubscribe = client.delete(f"/sessions/push/subscribe/{client_id}")
    assert unsubscribe.status_code == 204


def test_post_loss_review_returns_503_when_no_provider_keys_configured(client: TestClient):
    response = client.post(
        "/sessions/post-loss-review", json={"client_id": str(uuid4()), "note": "got walled"}
    )
    assert response.status_code == 503


def test_post_loss_review_404s_for_an_unknown_battle_log_entry_id(client: TestClient):
    response = client.post(
        "/sessions/post-loss-review",
        json={"client_id": str(uuid4()), "battle_log_entry_id": 999_999_999},
    )
    assert response.status_code == 404
