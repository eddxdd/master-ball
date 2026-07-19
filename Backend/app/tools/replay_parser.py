"""Parses Pokemon Showdown's own text replay-log protocol into structured
turns — a real, from-scratch implementation of (a practically-useful subset
of) Showdown's documented protocol
(https://github.com/smogon/pokemon-showdown/blob/master/PROTOCOL.md), not a
wrapper around an existing replay-parsing library. See
Docs/backend/README.md's "Replay parser (Phase 5)" section for the scope
note on which protocol commands are covered and why.

`fetch_replay` hits Showdown's own public, unauthenticated replay API
(https://replay.pokemonshowdown.com/<id>.json) — the same JSON a browser
loading a replay page fetches, not a private/scraped endpoint.
"""

import httpx

from app.schemas.replay import ParsedReplay, ReplayEvent, ReplayTurn

REPLAY_API_BASE = "https://replay.pokemonshowdown.com"

# Protocol commands worth surfacing as a distinct event — deliberately a
# curated subset, not every line Showdown emits. Omitted on purpose: `|split|`
# (a duplicate-view marker for spectator vs. player perspective — this parser
# always reads the spectator/public view that follows it), `|-anim|`,
# `|-hint|`, `|-message|`, `|-fieldactivate|`, and other purely-cosmetic or
# duplicate-information lines that would just add noise to a postmortem.
_NOTABLE_KINDS = {
    "move",
    "switch",
    "drag",
    "faint",
    "cant",
    "-damage",
    "-heal",
    "-status",
    "-curestatus",
    "-boost",
    "-unboost",
    "-setboost",
    "-weather",
    "-terastallize",
    "-ability",
    "-item",
    "-enditem",
    "-crit",
    "-supereffective",
    "-resisted",
    "-immune",
    "-fail",
    "-miss",
    "-sidestart",
    "-sideend",
    "-fieldstart",
    "-fieldend",
    "-mega",
    "-primal",
}


def _is_actor_token(token: str) -> bool:
    """True for Showdown's "p1a: Nickname" / "p2b: Nickname" position tokens
    — the first two characters are always "p1"/"p2" followed by an optional
    letter (singles has none; doubles/multi use a/b) and a colon."""
    return len(token) > 3 and token[0] == "p" and token[1] in "12" and ":" in token


def _summarize(kind: str, args: list[str]) -> str:
    actor = args[0] if args and _is_actor_token(args[0]) else None
    rest = args[1:] if actor else args

    if kind == "move":
        target = f" at {rest[1]}" if len(rest) > 1 and _is_actor_token(rest[1]) else ""
        return f"{actor} used {rest[0] if rest else '?'}{target}"
    if kind in ("switch", "drag"):
        species = rest[0].split(",")[0] if rest else "?"
        verb = "switched in" if kind == "switch" else "was dragged out, sending in"
        return f"{actor} {verb} {species}"
    if kind == "faint":
        return f"{actor} fainted"
    if kind == "cant":
        reason = rest[1] if len(rest) > 1 else (rest[0] if rest else "an unknown reason")
        return f"{actor} couldn't move ({reason})"
    if kind == "-damage":
        hp = rest[0] if rest else "?"
        return f"{actor} took damage (now at {hp})"
    if kind == "-heal":
        hp = rest[0] if rest else "?"
        return f"{actor} healed (now at {hp})"
    if kind == "-status":
        return f"{actor} was afflicted with {rest[0] if rest else '?'}"
    if kind == "-curestatus":
        return f"{actor} recovered from {rest[0] if rest else 'its status'}"
    if kind in ("-boost", "-unboost", "-setboost"):
        verb = "raised" if kind == "-boost" else "lowered" if kind == "-unboost" else "set"
        stat, stages = (rest + ["?", "?"])[:2]
        return f"{actor}'s {stat} was {verb} ({stages} stage(s))"
    if kind == "-weather":
        weather = args[0] if args else "?"
        return f"Weather changed to {weather}" if weather != "none" else "Weather cleared"
    if kind == "-terastallize":
        return f"{actor} Terastallized into the {rest[0] if rest else '?'} type"
    if kind in ("-mega", "-primal"):
        return f"{actor} {'Mega Evolved' if kind == '-mega' else 'Primal Reverted'}"
    if kind == "-ability":
        return f"{actor}'s ability {rest[0] if rest else '?'} activated"
    if kind in ("-item", "-enditem"):
        verb = "revealed" if kind == "-item" else "lost/consumed"
        return f"{actor} {verb} its item {rest[0] if rest else '?'}"
    if kind == "-crit":
        return f"Critical hit on {actor}"
    if kind == "-supereffective":
        return f"It was super effective against {actor}"
    if kind == "-resisted":
        return f"{actor} resisted the hit"
    if kind == "-immune":
        return f"{actor} was immune"
    if kind == "-fail":
        return f"The move failed against {actor}" if actor else "The move failed"
    if kind == "-miss":
        return f"The move missed {actor}" if actor else "The move missed"
    if kind == "-sidestart":
        return f"{args[0] if args else '?'}: {rest[0] if rest else '?'} was set up"
    if kind == "-sideend":
        return f"{args[0] if args else '?'}: {rest[0] if rest else '?'} was removed"
    if kind in ("-fieldstart", "-fieldend"):
        verb = "started" if kind == "-fieldstart" else "ended"
        return f"{args[0] if args else '?'} {verb}"
    return f"{kind} " + " ".join(args)


def parse_replay_log(raw_log: str) -> ParsedReplay:
    players: dict[str, str] = {}
    format_id: str | None = None
    winner: str | None = None
    turns: list[ReplayTurn] = []
    current_turn = ReplayTurn(number=0, events=[])

    for line in raw_log.splitlines():
        line = line.strip()
        if not line.startswith("|"):
            continue
        parts = line.split("|")[1:]  # split()[0] is always "" before the leading "|"
        if not parts:
            continue
        kind, args = parts[0], parts[1:]

        if kind == "player" and len(args) >= 2 and args[1]:
            players[args[0]] = args[1]
        elif kind == "tier" and args:
            format_id = args[0]
        elif kind == "win" and args:
            winner = args[0]
        elif kind == "turn" and args:
            turns.append(current_turn)
            current_turn = ReplayTurn(number=int(args[0]), events=[])
        elif kind in _NOTABLE_KINDS:
            actor = args[0] if args and _is_actor_token(args[0]) else None
            current_turn.events.append(
                ReplayEvent(kind=kind, actor=actor, summary=_summarize(kind, args))
            )

    turns.append(current_turn)
    # Drop any leading/trailing turns that ended up with no notable events
    # (e.g. team-preview-only lines before turn 1 on a log with nothing
    # else pre-battle) so callers don't have to filter empties themselves.
    turns = [t for t in turns if t.events]

    return ParsedReplay(
        format=format_id,
        players=players,
        winner=winner,
        turns=turns,
        turn_count=max((t.number for t in turns), default=0),
    )


async def fetch_replay(replay_id: str) -> str:
    """Fetches a replay's raw log from Showdown's own public API. Raises
    httpx.HTTPStatusError (handled by the router as a clean 404) if the
    replay id doesn't exist or is private."""
    replay_id = replay_id.removeprefix("https://replay.pokemonshowdown.com/").removesuffix(".json")
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(f"{REPLAY_API_BASE}/{replay_id}.json")
        response.raise_for_status()
        data = response.json()
    return data["log"]
