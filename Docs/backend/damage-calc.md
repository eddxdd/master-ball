# The damage calculator: formula scope and known limitations

`calculate_damage` (`Backend/app/tools/damage_calc.py`) is a from-scratch Python implementation of the official Gen 9 damage formula (as documented on Bulbapedia), not a wrapper around an existing library — the actual differentiated work in this project is this engine and the AI layer on top of it, not re-deriving Pokémon reference data (see [`tech-stack.md`](../tech-stack.md) for why `poke-env` is used for the data instead). This doc is the honest scope statement: what the formula covers, what it deliberately doesn't yet, and how it's verified.

## Verification approach

Every test in [`Backend/tests/test_damage_calc.py`](../../Backend/tests/test_damage_calc.py) hand-computes its expected value from the same official formula (stat calc → base damage → modifiers → 85–100% roll) in a comment, rather than being copied from an external calculator — so each assertion shows its own arithmetic and can be independently re-derived. `poke-env` does bundle its own Gen 9 damage calculator (`poke_env.calc.damage_calc_gen9`), which was evaluated as a cross-validation oracle, but it operates on a live `Battle`/`Pokemon` simulation object rather than a plain set of inputs — wiring up that much simulation state just for test fixtures wasn't worth it over hand-verified values for this pass. Revisit this if the calculator's scope grows enough that hand-verification becomes the bottleneck.

## In scope

- **Stat calculation** — the standard formula (level, IVs, EVs, nature), including the Shedinja base-HP-of-1 special case.
- **Stat stages** (-6..+6), with the official critical-hit rule: a crit ignores the attacker's *negative* stage and the defender's *positive* stage on the relevant stat.
- **STAB** — 1.5x normally, 2x with Adaptability; Terastallization is supported (STAB applies to the tera type and to the user's original types, per the real Gen 9 rule) with one documented gap below.
- **The full 18-type chart**, including dual-typing (product of both defending types) and Terastallized defenders (single tera type replaces the original types defensively).
- **Weather** — Sun/Rain boosting/reducing Fire/Water moves.
- **Screens** — Reflect/Light Screen/Aurora Veil (correctly *not* applied on a critical hit, per the real rule).
- **Burn** — halves physical damage, except with Guts (which also grants Guts's own +50% Attack boost while statused).
- **The 85–100% random roll** — all 16 values, not just min/max.
- **A curated set of common competitive items/abilities** (`Backend/app/data/calc_modifiers.py`): Choice Band/Specs/Scarf, Life Orb, Huge Power/Pure Power, Technician, Adaptability, Guts.
- **Spread-move damage** (0.75x) — as a manual flag the caller sets, not derived from an actual multi-target doubles simulation.

## Explicitly deferred (documented, not silently missing)

- **The long tail of ability/item interactions.** Anything not in `calc_modifiers.py` (e.g. Multiscale, Sturdy, Tinted Lens, Sheer Force, weather-setting abilities, type-changing abilities like Protean) is treated as no modifier at all — the calculator never crashes on an unrecognized ability/item, it just doesn't apply an effect for it yet. `Docs/backend/README.md`'s ability-description list (a *different*, broader curated set, used for the Pokédex UI's flavor text) is not the same list as this one — an ability can have a description without having a damage-calc modifier implemented, and vice versa.
- **Variable-base-power moves.** Moves like Facade (doubles if statused), Knock Off (boosts if the target holds a removable item), or weight-based moves (Low Kick, Heavy Slam) use their listed base power as-is; conditional adjustments aren't computed.
- **Full VGC/doubles targeting mechanics.** Redirection (Follow Me/Rage Powder), ally-targeting moves (Helping Hand), and multi-target damage-spreading logic beyond the flat spread-move multiplier above aren't modeled. This calculator is fundamentally a singles-shaped tool with one doubles-relevant flag bolted on, not a doubles battle simulator.
- **Terastallization's Adaptability double-stack edge case.** Real Gen 9 mechanics give a Pokémon that Terastallizes into one of its own original types *and* has Adaptability a 2.25x STAB multiplier (rather than the usual 2x cap). This implementation caps at 2x in that specific combination — a narrow, documented gap, not an oversight.
- **Stellar Tera type.** Only the 18 standard types are supported as a Tera type; Stellar's unique (one-time-per-Pokémon, category-based) mechanic isn't implemented.
- **Move-by-move flag effects beyond damage** (e.g. secondary effects, multi-hit move variance, contact-based abilities like Rough Skin) — this tool computes damage for a single hit of a single move, not a full turn's worth of battle-engine simulation.

## Where the modifier list lives

`Backend/app/data/calc_modifiers.py` is the single source of truth for which items/abilities have an implemented effect — check there (not this doc) for the exact current list, since it'll grow over time without necessarily needing a doc update for each addition. This doc's job is to state the *category* of what's covered and what's deferred, not to be a duplicate, driftable copy of the list itself.
