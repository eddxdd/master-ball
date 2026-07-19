"""Schemas for team import and analyze_team. A Team is always passed as a
full payload, never a server-side id — see the Phase 1 plan's scope note:
persistence is deferred until Phase 3 actually needs a user identity, so the
Team Builder holds this client-side (localStorage) instead."""

from pydantic import BaseModel, Field


class PokemonSet(BaseModel):
    species_id: str
    nickname: str | None = None
    level: int = 100
    nature: str = "hardy"
    ability: str | None = None
    item: str | None = None
    evs: dict[str, int] = Field(default_factory=dict)
    ivs: dict[str, int] = Field(default_factory=dict)
    moves: list[str] = Field(default_factory=list)
    tera_type: str | None = None


class Team(BaseModel):
    members: list[PokemonSet]


class TeamImportRequest(BaseModel):
    text: str


class TeamImportResponse(BaseModel):
    team: Team
    warnings: list[str] = Field(default_factory=list)
    """e.g. a species/move/ability the importer couldn't resolve. Import
    never fails outright over these — see Docs/backend/damage-calc.md's
    sibling doc on team-import scope for why (a false-rejected valid Showdown
    export is worse than a warned-about unknown field)."""


class TypeCoverageEntry(BaseModel):
    type: str
    weak_count: int
    resist_count: int
    immune_count: int


class SpeedTierEntry(BaseModel):
    species_id: str
    name: str
    nickname: str | None
    speed: int


class WeaknessMatrixEntry(BaseModel):
    species_id: str
    name: str
    nickname: str | None
    matchups: dict[str, float]


class RoleFlag(BaseModel):
    flag: str
    description: str


class MemberRoleEntry(BaseModel):
    """Per-Pokemon role card for the Team Builder's "About the team" panel —
    a short heuristic label + blurb grounded in base stats / EVs / item, not
    an LLM guess (same deterministic spirit as role_flags)."""

    species_id: str
    name: str
    nickname: str | None
    sprite_url: str
    type1: str
    type2: str | None
    role: str
    summary: str
    item: str | None
    ability: str | None
    speed: int


class TeamAnalysis(BaseModel):
    type_coverage: list[TypeCoverageEntry]
    speed_tiers: list[SpeedTierEntry]
    weakness_matrix: list[WeaknessMatrixEntry]
    role_flags: list[RoleFlag]
    member_roles: list[MemberRoleEntry] = Field(default_factory=list)
