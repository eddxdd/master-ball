"""Phase 5's background-job worker — Arq, backed by the same Valkey instance
Docker Compose already runs (see Docs/tech-stack.md's "why Valkey, not
Redis"). One job today (the meta-stats sync), on a daily cron schedule —
this is the scheduled/batched half of Docs/tech-stack.md's cost-discipline
principle: usage stats are synced once a day in the background, never
fetched live per-request.

Run the worker: `uv run arq app.worker.WorkerSettings` (from Backend/, with
the same .env/DB access the API needs). See Docs/backend/README.md's
"Background worker (Phase 5)" section for the docker-compose wiring.
"""

import logging

from arq.connections import RedisSettings
from arq.cron import cron

from app.core.config import get_settings
from scripts.sync_usage_stats import sync_usage_stats

logger = logging.getLogger(__name__)


async def sync_usage_stats_job(ctx: dict, format_id: str = "gen9ou", cutoff: int = 1500) -> int:
    """The Arq-wrapped version of `scripts.sync_usage_stats.sync_usage_stats`
    — same function, just invoked on a schedule instead of by hand. Kept as a
    thin wrapper (not reimplemented) so `uv run python -m scripts.sync_usage_stats`
    and the scheduled job can never drift apart."""
    count = await sync_usage_stats(format_id, cutoff)
    logger.info("Synced usage stats for %d Pokemon (%s, cutoff %d).", count, format_id, cutoff)
    return count


async def on_startup(ctx: dict) -> None:
    logger.info("Master Ball worker starting up.")


async def on_shutdown(ctx: dict) -> None:
    logger.info("Master Ball worker shutting down.")


class WorkerSettings:
    functions = [sync_usage_stats_job]
    cron_jobs = [
        # 04:00 UTC — comfortably after Smogon typically finishes publishing
        # a new month's stats a few days into the month, and off-peak for
        # this app's own traffic.
        cron(sync_usage_stats_job, hour=4, minute=0),
    ]
    on_startup = on_startup
    on_shutdown = on_shutdown
    # Arq's CLI (`arq app.worker.WorkerSettings`) reads this as a plain
    # attribute — built from Settings (not a hardcoded URL) so the worker
    # picks up the same VALKEY_URL config the API uses, in every environment.
    redis_settings = RedisSettings.from_dsn(get_settings().valkey_url)


__all__ = ["WorkerSettings", "sync_usage_stats_job"]
