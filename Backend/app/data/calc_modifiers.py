"""The curated set of item/ability damage modifiers calculate_damage actually
implements — see Docs/backend/damage-calc.md for the full scope statement.
Anything not listed here is silently treated as "no modifier" rather than
raising an error, so the calculator never crashes on an unsupported item or
ability — it just doesn't (yet) apply that specific effect."""

CHOICE_ITEMS: dict[str, tuple[str, float]] = {
    "choiceband": ("atk", 1.5),
    "choicespecs": ("spa", 1.5),
    "choicescarf": ("spe", 1.5),
}

LIFE_ORB_ID = "lifeorb"
LIFE_ORB_MULTIPLIER = 1.3

HUGE_POWER_ABILITIES = {"hugepower", "purepower"}
TECHNICIAN_ABILITY = "technician"
TECHNICIAN_THRESHOLD = 60
ADAPTABILITY_ABILITY = "adaptability"
GUTS_ABILITY = "guts"
