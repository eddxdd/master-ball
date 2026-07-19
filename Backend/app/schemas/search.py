"""Pydantic schemas for the global header search bar — see app/tools/search.py."""

from pydantic import BaseModel


class SearchResultItem(BaseModel):
    id: str
    name: str
    subtitle: str | None = None
    sprite_url: str | None = None


class SearchResults(BaseModel):
    """One bounded (see app/tools/search.py's LIMIT_PER_KIND) list per entity
    kind, pre-grouped server-side so the frontend doesn't need to regroup a
    flat list — each group key doubles as the route segment (`/pokedex/{id}`,
    `/moves/{id}`, etc.) the frontend's SearchBar navigates to on selection."""

    pokemon: list[SearchResultItem] = []
    moves: list[SearchResultItem] = []
    abilities: list[SearchResultItem] = []
    items: list[SearchResultItem] = []
    types: list[SearchResultItem] = []
