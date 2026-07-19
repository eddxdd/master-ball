"""Generates a sitemap.xml covering every static route plus every seeded
Pokedex/moves/abilities/types/items detail page, and writes it into
Frontend/public/ so Vite ships it at the site root (see Docs/frontend/README.md's
SEO section) — this is a client-only SPA with no server-side routing, so there's
no way to generate this on-demand per-request the way a server-rendered app
would; a checked-in-when-needed static file is the pragmatic equivalent.

Usage (from Backend/):
    uv run python -m scripts.generate_sitemap --site-url https://masterball.app

Re-run this after a `seed_pokedex` refresh (new species/moves/abilities/items)
or once the production domain is finalized. Not run automatically as part of
seeding since the site URL isn't known at seed time in every environment.
"""

import argparse
import asyncio
from datetime import UTC, datetime
from pathlib import Path
from xml.sax.saxutils import escape

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal, engine
from app.models import Ability, Item, Move, Species

STATIC_ROUTES = ["/", "/pokedex", "/calculator", "/team-builder"]

DEFAULT_OUTPUT = (
    Path(__file__).resolve().parent.parent.parent / "Frontend" / "public" / "sitemap.xml"
)


async def _detail_paths(session: AsyncSession) -> list[str]:
    paths = list(STATIC_ROUTES)

    species_ids = (await session.execute(select(Species.id))).scalars().all()
    paths += [f"/pokedex/{species_id}" for species_id in species_ids]

    move_ids = (await session.execute(select(Move.id))).scalars().all()
    paths += [f"/moves/{move_id}" for move_id in move_ids]

    ability_ids = (await session.execute(select(Ability.id))).scalars().all()
    paths += [f"/abilities/{ability_id}" for ability_id in ability_ids]

    item_ids = (await session.execute(select(Item.id))).scalars().all()
    paths += [f"/items/{item_id}" for item_id in item_ids]

    type_names = set((await session.execute(select(Species.type1).distinct())).scalars().all())
    type_names |= set((await session.execute(select(Species.type2).distinct())).scalars().all())
    type_names.discard(None)
    paths += [f"/types/{type_name}" for type_name in sorted(type_names)]

    return paths


def _render_xml(site_url: str, paths: list[str]) -> str:
    today = datetime.now(UTC).date().isoformat()
    urls = "\n".join(
        f"  <url>\n"
        f"    <loc>{escape(site_url.rstrip('/'))}{escape(path)}</loc>\n"
        f"    <lastmod>{today}</lastmod>\n"
        f"  </url>"
        for path in paths
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{urls}\n"
        "</urlset>\n"
    )


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--site-url",
        required=True,
        help="Absolute origin to build URLs from, e.g. https://masterball.app (no trailing slash).",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    async with AsyncSessionLocal() as session:
        paths = await _detail_paths(session)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(_render_xml(args.site_url, paths), encoding="utf-8")

    await engine.dispose()
    print(f"Wrote {len(paths)} URLs to {args.output}")


if __name__ == "__main__":
    asyncio.run(main())
