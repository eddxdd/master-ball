"""search_all — the header search bar's tool. Queries Species/Move/Ability/Item
by name (plus the static 18-type list) and returns a handful of top matches
per kind, ranked "starts with" before "contains". See Docs/frontend/README.md's
"Global search" section for the frontend side.

Deliberately plain substring `ILIKE` with no trigram/GIN index: every table
here is small (species/moves each under ~1,500 rows, abilities/items smaller
still), so a sequential scan costs well under a millisecond — adding a
pg_trgm index would be optimizing a cost that doesn't exist yet. Revisit if
any of these tables ever grow by an order of magnitude.
"""

from collections.abc import Sequence
from typing import Any

from sqlalchemy import ColumnElement, case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Ability, Item, Move, Species
from app.schemas.search import SearchResultItem, SearchResults
from app.tools.type_chart import ALL_TYPES

LIMIT_PER_KIND = 6


async def _search_by_name(
    db: AsyncSession, model: type, name_col: ColumnElement[str], query: str, limit: int
) -> Sequence[Any]:
    prefix_match = name_col.ilike(f"{query}%")
    stmt = (
        select(model)
        .where(name_col.ilike(f"%{query}%"))
        .order_by(case((prefix_match, 0), else_=1), name_col)
        .limit(limit)
    )
    return (await db.execute(stmt)).scalars().all()


async def search_all(
    db: AsyncSession, query: str, limit_per_kind: int = LIMIT_PER_KIND
) -> SearchResults:
    q = query.strip()
    if not q:
        return SearchResults()

    species = await _search_by_name(db, Species, Species.name, q, limit_per_kind)
    moves = await _search_by_name(db, Move, Move.name, q, limit_per_kind)
    abilities = await _search_by_name(db, Ability, Ability.name, q, limit_per_kind)
    items = await _search_by_name(db, Item, Item.name, q, limit_per_kind)

    return SearchResults(
        pokemon=[
            SearchResultItem(
                id=s.id,
                name=s.name,
                subtitle="/".join(filter(None, [s.type1, s.type2])),
                sprite_url=s.sprite_url,
            )
            for s in species
        ],
        moves=[
            SearchResultItem(id=m.id, name=m.name, subtitle=f"{m.type} \u00b7 {m.category}")
            for m in moves
        ],
        abilities=[SearchResultItem(id=a.id, name=a.name) for a in abilities],
        items=[SearchResultItem(id=i.id, name=i.name, sprite_url=i.sprite_url) for i in items],
        types=[SearchResultItem(id=t, name=t) for t in ALL_TYPES if q.lower() in t.lower()][
            :limit_per_kind
        ],
    )
