"""build_replay_coach_prompt — turns a parsed Showdown replay into a prompt
for the *exact same* Phase 2 agent graph (app/agent/graph.py), the same
"reuse the agent, don't stand up a second LLM pipeline" pattern
app/tools/battle_log.py's build_post_loss_prompt already established for the
Mental-Game Coach's post-loss review. See Docs/roadmap.md's Phase 5 section.

The parsing itself (app/tools/replay_parser.py) is fully deterministic; only
the *commentary* — explaining why a turn mattered — is the agent's job, and
it's expected to reach for calculate_damage/get_pokemon_profile/
retrieve_context itself while doing so, same as any other chat turn.
"""

from app.schemas.replay import ParsedReplay

MAX_TURNS_IN_PROMPT = 40
"""Caps how much of a long replay gets embedded directly in the prompt —
matches keep this well under typical context limits without needing to
summarize-the-summary."""


def _format_turn(turn) -> str:  # noqa: ANN001 - ReplayTurn, kept loose to avoid a circular import
    lines = "\n".join(f"  - {event.summary}" for event in turn.events)
    return f"Turn {turn.number}:\n{lines}"


def build_replay_coach_prompt(replay: ParsedReplay) -> str:
    if not replay.turns:
        return (
            "The user shared a replay log, but no turn-by-turn events could be parsed from it "
            "(it may be empty, truncated, or not a real Showdown replay log). Ask them to "
            "double check the replay URL/log they pasted."
        )

    players = ", ".join(f"{side}: {name}" for side, name in replay.players.items()) or "unknown"
    winner = replay.winner or "unclear from the log"
    turns_text = "\n\n".join(_format_turn(t) for t in replay.turns[:MAX_TURNS_IN_PROMPT])
    truncated_note = (
        f"\n\n(Showing the first {MAX_TURNS_IN_PROMPT} of {len(replay.turns)} turns.)"
        if len(replay.turns) > MAX_TURNS_IN_PROMPT
        else ""
    )

    return (
        f"The user shared a {replay.format or 'Pokemon'} battle replay to review. "
        f"Players: {players}. Winner: {winner}.\n\n"
        "Here is the turn-by-turn log:\n\n"
        f"{turns_text}{truncated_note}\n\n"
        "Write a short postmortem: identify the 1-3 turning-point turns (a key faint, a "
        "critical hit, a missed move, a bad switch, or a Terastallization that swung the "
        "game), explain *why* each one mattered using any tools you need (checking a "
        "Pokemon's matchup or calculating whether an alternative move/switch would have "
        "done better), and end with one concrete takeaway for next time. Be specific about "
        "turn numbers and Pokemon names, not generic."
    )
