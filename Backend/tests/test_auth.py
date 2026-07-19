"""Integration tests for /auth/* (app/routers/auth.py) — signup, login, and
the protected /auth/me get/patch endpoints. Uses real Postgres via
TestClient, unique emails per test (uuid4()) to avoid collisions across runs
against the same dev database, mirroring tests/test_sessions.py's convention.
"""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _unique_email() -> str:
    return f"{uuid4()}@example.com"


def test_signup_returns_token_and_user(client: TestClient):
    email = _unique_email()
    response = client.post(
        "/auth/signup",
        json={"email": email, "password": "correct-horse", "display_name": "Ash"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["email"] == email
    assert body["user"]["display_name"] == "Ash"
    assert "hashed_password" not in body["user"]


def test_signup_with_duplicate_email_returns_409(client: TestClient):
    email = _unique_email()
    payload = {"email": email, "password": "correct-horse", "display_name": "Ash"}

    first = client.post("/auth/signup", json=payload)
    assert first.status_code == 200

    second = client.post("/auth/signup", json=payload)
    assert second.status_code == 409


def test_signup_with_short_password_returns_422(client: TestClient):
    response = client.post(
        "/auth/signup",
        json={"email": _unique_email(), "password": "short", "display_name": "Ash"},
    )
    assert response.status_code == 422


def test_login_with_correct_password_returns_token(client: TestClient):
    email = _unique_email()
    client.post(
        "/auth/signup",
        json={"email": email, "password": "correct-horse", "display_name": "Ash"},
    )

    response = client.post("/auth/login", json={"email": email, "password": "correct-horse"})
    assert response.status_code == 200
    assert response.json()["user"]["email"] == email


def test_login_with_wrong_password_returns_401(client: TestClient):
    email = _unique_email()
    client.post(
        "/auth/signup",
        json={"email": email, "password": "correct-horse", "display_name": "Ash"},
    )

    response = client.post("/auth/login", json={"email": email, "password": "wrong-password"})
    assert response.status_code == 401


def test_login_with_unknown_email_returns_401(client: TestClient):
    response = client.post(
        "/auth/login", json={"email": _unique_email(), "password": "whatever12"}
    )
    assert response.status_code == 401


def test_me_without_token_returns_401(client: TestClient):
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_me_with_valid_token_returns_current_user(client: TestClient):
    email = _unique_email()
    signup = client.post(
        "/auth/signup",
        json={"email": email, "password": "correct-horse", "display_name": "Ash"},
    )
    token = signup.json()["access_token"]

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["email"] == email


def test_me_with_invalid_token_returns_401(client: TestClient):
    response = client.get("/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 401


def test_patch_me_updates_display_name(client: TestClient):
    email = _unique_email()
    signup = client.post(
        "/auth/signup",
        json={"email": email, "password": "correct-horse", "display_name": "Ash"},
    )
    token = signup.json()["access_token"]

    response = client.patch(
        "/auth/me",
        json={"display_name": "Red"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["display_name"] == "Red"

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.json()["display_name"] == "Red"
