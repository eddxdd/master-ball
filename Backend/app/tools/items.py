"""get_item_detail — the Items tool. See app/tools/pokedex.py's module docstring
for why these are plain functions rather than methods on some service class."""

from poke_env.data.normalize import to_id_str
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Item
from app.schemas.items import ItemDetail, ItemSummary

# Showdown's `to_id_str` and PokeAPI's item slugs disagree on a handful of
# ids (most famously Focus Sash: Showdown `focusash` vs our seeded
# `focussash`). Resolve those before 404'ing so imports / random teams /
# sprite lookups all see the real row.
_SHOWDOWN_ITEM_ALIASES: dict[str, str] = {
    "focusash": "focussash",
}


async def list_items(db: AsyncSession) -> list[ItemSummary]:
    """Full item catalog for the Pokedex Items tab — client filters locally."""
    result = await db.execute(select(Item).order_by(Item.name, Item.id))
    return [
        ItemSummary(
            id=item.id,
            name=item.name,
            category=item.category,
            sprite_url=item.sprite_url,
        )
        for item in result.scalars().all()
    ]


async def get_item_detail(db: AsyncSession, item_id: str) -> ItemDetail | None:
    normalized = to_id_str(item_id)
    item = await db.get(Item, normalized)
    if item is None:
        alias = _SHOWDOWN_ITEM_ALIASES.get(normalized)
        if alias:
            item = await db.get(Item, alias)
    if item is None:
        return None
    return ItemDetail(
        id=item.id,
        name=item.name,
        description=item.description,
        category=item.category,
        fling_power=item.fling_power,
        sprite_url=item.sprite_url,
    )
