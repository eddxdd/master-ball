"""Pydantic schemas for the Items feature — see app/models/pokemon.py's `Item`
and app/data/pokeapi_client.py's `get_items` for where the data comes from."""

from pydantic import BaseModel


class ItemSummary(BaseModel):
    id: str
    name: str
    category: str
    sprite_url: str | None


class ItemDetail(ItemSummary):
    """get_item_detail's output. Unlike moves/abilities/types, there's no
    reverse Pokemon lookup here — no per-species item association exists
    anywhere in the data model (see Docs/backend/README.md)."""

    description: str | None
    fling_power: int | None
