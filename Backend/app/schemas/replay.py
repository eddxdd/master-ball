"""Pydantic schemas for Phase 5's Showdown replay parser — see
app/tools/replay_parser.py.
"""

from pydantic import BaseModel


class ReplayEvent(BaseModel):
    """One parsed line from a Showdown replay log. `kind` is the protocol
    command verbatim (e.g. "move", "-damage", "switch", "faint") — see
    https://github.com/smogon/pokemon-showdown/blob/master/PROTOCOL.md for the
    full spec this parser implements a practically-useful subset of."""

    kind: str
    actor: str | None = None
    """The acting Pokemon's position + nickname, e.g. "p1a: Landorus-Therian"
    — None for events with no clear single actor (e.g. a field-wide weather
    change)."""
    summary: str
    """A short, human-readable rendering of this event (e.g. "Landorus-Therian
    used Earthquake") — what the Replay Coach prompt and any future UI
    actually read, so parsing logic only has to live in one place."""


class ReplayTurn(BaseModel):
    number: int
    """0 for team preview / pre-turn-1 setup events."""
    events: list[ReplayEvent]


class ParsedReplay(BaseModel):
    format: str | None
    players: dict[str, str]
    """{"p1": "username", "p2": "username"} — omits any side not found in the
    log rather than guessing a placeholder name."""
    winner: str | None
    turns: list[ReplayTurn]
    turn_count: int


class ReplayParseRequest(BaseModel):
    log: str | None = None
    """A raw Showdown replay log, pasted directly."""
    replay_id: str | None = None
    """A replay id/slug (e.g. "gen9ou-1234567890") — if given, the log is
    fetched server-side from Pokemon Showdown's own public replay API rather
    than requiring the user to copy-paste the raw log. Exactly one of `log`/
    `replay_id` must be given; validated in app/routers/replay.py."""


class ReplayCoachRequest(BaseModel):
    log: str | None = None
    replay_id: str | None = None
