"""Export thumbs-down chat feedback into eval/golden/chat_from_feedback.jsonl.

Run periodically (or after a bad-turn review) to grow the golden set from real
user failures:

    uv run python -m scripts.export_feedback_to_golden
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.feedback import ChatFeedback

OUT = Path(__file__).resolve().parents[1] / "eval" / "golden" / "chat_from_feedback.jsonl"


async def main() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ChatFeedback).where(
                ChatFeedback.rating == "down",
                ChatFeedback.exported.is_(False),
            )
        )
        rows = list(result.scalars())
        if not rows:
            print("No unexported thumbs-down feedback.")
            return

        OUT.parent.mkdir(parents=True, exist_ok=True)
        with OUT.open("a", encoding="utf-8") as fh:
            for row in rows:
                fh.write(
                    json.dumps(
                        {
                            "id": f"feedback-{row.id}",
                            "query": row.message,
                            "expected_keywords": [],
                            "notes": row.comment or "Exported from thumbs-down feedback",
                            "source_turn_id": row.turn_id,
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                row.exported = True
        await db.commit()
        print(f"Exported {len(rows)} feedback row(s) -> {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
