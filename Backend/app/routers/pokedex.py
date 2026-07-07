from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.pokemon import PokemonProfile, PokemonSummary
from app.tools.pokedex import get_pokemon_profile, list_pokemon

router = APIRouter(prefix="/pokedex", tags=["pokedex"])


@router.get("", response_model=list[PokemonSummary])
async def browse_pokedex(
    search: str | None = None,
    type: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[PokemonSummary]:
    return await list_pokemon(db, search=search, type_filter=type)


@router.get("/{species_id}", response_model=PokemonProfile)
async def read_pokemon_profile(
    species_id: str, db: AsyncSession = Depends(get_db)
) -> PokemonProfile:
    profile = await get_pokemon_profile(db, species_id)
    if profile is None:
        raise HTTPException(status_code=404, detail=f"No Pokemon found with id '{species_id}'")
    return profile
