"""Performance regression test for calculate_damage — the calculator is a
core product pillar competing on speed against established tools, so a
performance regression should fail CI the same way a correctness regression
would. See Docs/tech-stack.md's "Performance & cost discipline" section."""

from fastapi.testclient import TestClient

from app.main import app


def test_damage_calc_endpoint_is_fast(benchmark):
    with TestClient(app) as client:
        payload = {
            "attacker": {"species_id": "landorustherian", "evs": {"atk": 252}, "nature": "jolly"},
            "defender": {"species_id": "pikachu", "nature": "hardy"},
            "move_id": "earthquake",
            "field": {},
        }

        def call():
            response = client.post("/calculator/damage", json=payload)
            assert response.status_code == 200

        benchmark(call)

    # Full HTTP round-trip (routing, validation, four DB queries, response
    # serialization) — sub-100ms is the target from Docs/tech-stack.md; this
    # asserts well inside that budget to catch a regression early.
    assert benchmark.stats["mean"] < 0.1
