"""Unit/integration tests for app/tools/battle_log.py — the "two-loss rule"
tilt-detection logic (Docs/product-research.md) and battle-result logging.
Real DB, real queries, no LLM/push involved — deterministic all the way
through. Each test uses its own random client_id so tests never see each
other's rows.
"""

from uuid import uuid4

from app.db.session import AsyncSessionLocal, engine
from app.tools.battle_log import check_tilt_risk, list_battle_log, log_battle_result


async def test_no_losses_means_no_nudge():
    client_id = str(uuid4())
    async with AsyncSessionLocal() as db:
        await log_battle_result(db, client_id, "win", None)
        result = await check_tilt_risk(db, client_id)
    await engine.dispose()

    assert result.consecutive_losses == 0
    assert result.nudge is False
    assert result.message is None


async def test_single_loss_does_not_nudge():
    client_id = str(uuid4())
    async with AsyncSessionLocal() as db:
        await log_battle_result(db, client_id, "loss", "got outsped")
        result = await check_tilt_risk(db, client_id)
    await engine.dispose()

    assert result.consecutive_losses == 1
    assert result.nudge is False


async def test_two_consecutive_losses_triggers_the_two_loss_rule():
    client_id = str(uuid4())
    async with AsyncSessionLocal() as db:
        await log_battle_result(db, client_id, "loss", "first loss")
        await log_battle_result(db, client_id, "loss", "second loss")
        result = await check_tilt_risk(db, client_id)
    await engine.dispose()

    assert result.consecutive_losses == 2
    assert result.nudge is True
    assert result.message is not None
    assert "2 losses in a row" in result.message


async def test_a_win_in_between_resets_the_streak():
    client_id = str(uuid4())
    async with AsyncSessionLocal() as db:
        await log_battle_result(db, client_id, "loss", None)
        await log_battle_result(db, client_id, "loss", None)
        await log_battle_result(db, client_id, "win", None)
        result = await check_tilt_risk(db, client_id)
    await engine.dispose()

    assert result.consecutive_losses == 0
    assert result.nudge is False


async def test_three_losses_in_a_row_still_reports_the_real_streak_length():
    client_id = str(uuid4())
    async with AsyncSessionLocal() as db:
        for _ in range(3):
            await log_battle_result(db, client_id, "loss", None)
        result = await check_tilt_risk(db, client_id)
    await engine.dispose()

    assert result.consecutive_losses == 3
    assert result.nudge is True


async def test_list_battle_log_returns_most_recent_first():
    client_id = str(uuid4())
    async with AsyncSessionLocal() as db:
        await log_battle_result(db, client_id, "win", "game 1")
        await log_battle_result(db, client_id, "loss", "game 2")
        entries = await list_battle_log(db, client_id)
    await engine.dispose()

    assert [e.note for e in entries] == ["game 2", "game 1"]


async def test_battle_log_is_scoped_per_client_id():
    client_a, client_b = str(uuid4()), str(uuid4())
    async with AsyncSessionLocal() as db:
        await log_battle_result(db, client_a, "loss", None)
        await log_battle_result(db, client_a, "loss", None)
        result_a = await check_tilt_risk(db, client_a)
        result_b = await check_tilt_risk(db, client_b)
    await engine.dispose()

    assert result_a.nudge is True
    assert result_b.consecutive_losses == 0
