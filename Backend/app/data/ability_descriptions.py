"""Hand-curated ability descriptions for the most common competitive abilities.

poke-env's bundled data (sourced from Showdown) has no description/flavor text
for abilities or moves — only mechanical data (ids, names, base power, etc.).
Rather than leaving every ability blank in the Pokedex UI, this is a small,
honest, explicitly-scoped list covering the abilities this project's damage
calculator actually implements modifiers for (see Docs/backend/damage-calc.md),
plus a handful of other abilities common enough to be worth a real description.
Everything not listed here shows the ability name only — a documented gap, not
a silent one.
"""

ABILITY_DESCRIPTIONS: dict[str, str] = {
    "intimidate": "On switch-in, lowers the Attack of opposing Pokemon by one stage.",
    "hugepower": "Doubles the Pokemon's Attack stat.",
    "purepower": "Doubles the Pokemon's Attack stat.",
    "guts": "Boosts Attack by 50% if statused, and ignores burn's usual Attack drop.",
    "adaptability": "Boosts the same-type attack bonus (STAB) from 1.5x to 2x.",
    "technician": "Boosts the power of moves with a base power of 60 or lower by 50%.",
    "sheerforce": "Boosts moves with a secondary effect by 30%, but removes that effect.",
    "tintedlens": "Doubles the damage of moves that are 'not very effective' against the target.",
    "moxie": "Raises Attack by one stage after knocking out a Pokemon.",
    "levitate": "Grants immunity to Ground-type moves.",
    "multiscale": "Halves damage taken while the Pokemon is at full HP.",
    "sturdy": "Prevents a one-hit KO from full HP, leaving the Pokemon with 1 HP instead.",
    "regenerator": "Restores 1/3 of the Pokemon's max HP when it switches out.",
    "protean": "Changes the Pokemon's type to match the move it's about to use.",
    "libero": "Changes the Pokemon's type to match the move it's about to use.",
    "unaware": "Ignores the target's stat stage changes when calculating damage.",
    "prankster": "Gives priority to status moves.",
    "speedboost": "Raises Speed by one stage at the end of each turn the Pokemon is on the field.",
    "drought": "Summons harsh sunlight on switch-in.",
    "drizzle": "Summons rain on switch-in.",
    "sandstream": "Summons a sandstorm on switch-in.",
    "snowwarning": "Summons snow/hail on switch-in.",
    "weakarmor": "Lowers Defense and raises Speed by two stages when hit by a physical move.",
    "waterabsorb": "Grants immunity to Water-type moves and restores HP when hit by one.",
    "voltabsorb": "Grants immunity to Electric-type moves and restores HP when hit by one.",
    "flashfire": "Grants Fire immunity, and boosts the user's own Fire moves once hit by one.",
    "stamina": "Raises Defense by one stage when hit by an attack.",
    "clearbody": "Prevents other Pokemon from lowering this Pokemon's stats.",
    "magicbounce": "Reflects most status moves back at the user instead of taking effect.",
    "goodasgold": "Grants immunity to status moves used by other Pokemon.",
}
