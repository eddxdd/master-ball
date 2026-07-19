"""Web Push sending + subscription storage — Phase 3's Mental-Game Coach
nudge delivery. See Docs/roadmap.md's Phase 3 section and
Docs/backend/README.md's "Mental-Game Coach (Phase 3)" section.

VAPID keys (see scripts/generate_vapid_keys.py) are generated once and stored
as env vars, never regenerated at runtime — regenerating them would silently
invalidate every existing browser subscription, since the public key is baked
into the subscription itself via `applicationServerKey`.
"""

import json

from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.session import PushSubscription
from app.schemas.session import PushSubscribeRequest


def is_push_configured() -> bool:
    settings = get_settings()
    return bool(settings.vapid_public_key and settings.vapid_private_key)


def send_push_notification(subscription_info: dict, title: str, body: str) -> bool:
    """Returns False rather than raising on any delivery failure (e.g. an
    expired browser subscription, or Web Push simply not being configured
    locally) — a failed push must never break the battle-log request it's a
    side effect of."""
    settings = get_settings()
    if not is_push_configured():
        return False

    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps({"title": title, "body": body}),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": f"mailto:{settings.vapid_claims_email}"},
        )
        return True
    except WebPushException:
        return False


async def get_push_subscription(db: AsyncSession, client_id: str) -> PushSubscription | None:
    result = await db.execute(
        select(PushSubscription).where(PushSubscription.client_id == client_id)
    )
    return result.scalar_one_or_none()


async def upsert_push_subscription(
    db: AsyncSession, request: PushSubscribeRequest
) -> PushSubscription:
    existing = await get_push_subscription(db, request.client_id)
    if existing is not None:
        existing.endpoint = request.endpoint
        existing.p256dh = request.keys.p256dh
        existing.auth = request.keys.auth
        subscription = existing
    else:
        subscription = PushSubscription(
            client_id=request.client_id,
            endpoint=request.endpoint,
            p256dh=request.keys.p256dh,
            auth=request.keys.auth,
        )
        db.add(subscription)
    await db.commit()
    await db.refresh(subscription)
    return subscription


async def delete_push_subscription(db: AsyncSession, client_id: str) -> None:
    await db.execute(delete(PushSubscription).where(PushSubscription.client_id == client_id))
    await db.commit()
