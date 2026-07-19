"""log_battle_result + check_tilt_risk — Phase 3's deterministic session
tracking. See Docs/roadmap.md's Phase 3 section and Docs/product-research.md
for the community's own "two-loss rule" this implements. Deterministic, no
LLM — see app/agent's build_post_loss_prompt below for where the LLM actually
gets involved (explaining *why*, not detecting *that* there's a streak).
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.session import BattleLogEntry
from app.schemas.session import TiltCheckResult
from app.tools.push import get_push_subscription, send_push_notification

TILT_STREAK_THRESHOLD = 2
RECENT_HISTORY_LIMIT = 20


async def log_battle_result(
    db: AsyncSession, client_id: str, result: str, note: str | None
) -> BattleLogEntry:
    entry = BattleLogEntry(client_id=client_id, result=result, note=note)
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def list_battle_log(
    db: AsyncSession, client_id: str, limit: int = RECENT_HISTORY_LIMIT
) -> list[BattleLogEntry]:
    result = await db.execute(
        select(BattleLogEntry)
        .where(BattleLogEntry.client_id == client_id)
        .order_by(BattleLogEntry.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_battle_log_entry(db: AsyncSession, entry_id: int) -> BattleLogEntry | None:
    return await db.get(BattleLogEntry, entry_id)


async def check_tilt_risk(db: AsyncSession, client_id: str) -> TiltCheckResult:
    """Counts consecutive losses ending at the most recent entry — a win
    anywhere in the streak resets the count to 0 (the community's own
    "two-loss rule": *back-to-back* losses trigger a nudge, a win in between
    doesn't count toward it)."""
    entries = await list_battle_log(db, client_id)

    streak = 0
    for entry in entries:
        if entry.result == "loss":
            streak += 1
        else:
            break

    nudge = streak >= TILT_STREAK_THRESHOLD
    message = (
        f"That's {streak} losses in a row — want a break, or a quick postmortem "
        "instead of queuing again?"
        if nudge
        else None
    )
    return TiltCheckResult(consecutive_losses=streak, nudge=nudge, message=message)


async def maybe_send_tilt_nudge(
    db: AsyncSession, client_id: str, tilt_check: TiltCheckResult
) -> bool:
    """The side effect `check_tilt_risk` triggers when it fires, per
    Docs/ai-agents-and-rag.md's tool table — a plain function call, not
    another LLM step. Returns False (not an error) whenever there's simply
    nothing to notify (no nudge, or no subscription yet)."""
    if not tilt_check.nudge:
        return False
    subscription = await get_push_subscription(db, client_id)
    if subscription is None:
        return False
    subscription_info = {
        "endpoint": subscription.endpoint,
        "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
    }
    return send_push_notification(subscription_info, "Master Ball", tilt_check.message or "")


def build_post_loss_prompt(note: str | None) -> str:
    """Turns a logged loss's free-text note into a chat-agent prompt — see
    app/routers/sessions.py's POST /sessions/post-loss-review, which reuses
    the *exact same* Phase 2 agent graph (app/agent/graph.py) rather than a
    second, parallel LLM pipeline. Grounded by whatever calculate_damage/
    retrieve_context calls the agent itself decides to make in response, per
    Docs/roadmap.md Phase 3's "post-loss explanation flow"."""
    if not note or not note.strip():
        return (
            "The user just logged a loss but didn't leave any notes about what happened. "
            "Ask them one specific, concrete question that would help you explain the loss "
            "(e.g. what their team was, or what beat them)."
        )
    return (
        "The user just lost a match and wrote this note about it: "
        f'"{note.strip()}". Help them understand specifically what likely went wrong, '
        "using any tools you need (checking a Pokemon's matchup, a damage calculation, or "
        "relevant strategy notes), and suggest one concrete thing to consider differently "
        "next time. Be specific, not generic — this is exactly the kind of 'why did I lose' "
        "moment a real coach would engage with in detail."
    )
