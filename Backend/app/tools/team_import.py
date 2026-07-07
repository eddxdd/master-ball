"""Showdown team-import parsing — leans on poke-env's Teambuilder rather than
hand-rolled regex, per the Phase 1 plan. Species/move/ability validation
against the seeded Pokedex happens in the router (needs a DB session this
pure-parsing step doesn't), and is lenient (warn, don't reject) — see
Docs/backend/README.md for why a false-rejected valid Showdown export would
be worse than surfacing a warning."""

from poke_env.data.normalize import to_id_str
from poke_env.teambuilder import Teambuilder

from app.schemas.team import PokemonSet, Team

STAT_ORDER = ("hp", "atk", "def", "spa", "spd", "spe")


def parse_showdown_team(text: str) -> Team:
    mons = Teambuilder.parse_showdown_team(text)
    members = []

    for mon in mons:
        species_display = mon.species or mon.nickname
        evs = dict(zip(STAT_ORDER, mon.evs, strict=False)) if mon.evs else {}
        ivs = dict(zip(STAT_ORDER, mon.ivs, strict=False)) if mon.ivs else {}
        # EVs of 0 are the common case and not worth cluttering the payload
        # with — only keep the non-zero ones.
        evs = {k: v for k, v in evs.items() if v}

        members.append(
            PokemonSet(
                species_id=to_id_str(species_display) if species_display else "",
                nickname=mon.nickname if mon.species else None,
                level=mon.level or 100,
                nature=to_id_str(mon.nature) if mon.nature else "hardy",
                ability=to_id_str(mon.ability) if mon.ability else None,
                item=to_id_str(mon.item) if mon.item else None,
                evs=evs,
                ivs=ivs,
                moves=[to_id_str(m) for m in (mon.moves or [])],
                tera_type=mon.tera_type,
            )
        )

    return Team(members=members)
