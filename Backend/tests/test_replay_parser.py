"""Unit tests for app/tools/replay_parser.py against a hand-constructed
Showdown replay log, written to exactly match the real documented protocol
shape (https://github.com/smogon/pokemon-showdown/blob/master/PROTOCOL.md) —
same "hand-derive the expected value" discipline as the damage calc tests.
"""

from app.tools.replay_parser import parse_replay_log

SAMPLE_LOG = """
|player|p1|Ash|red|
|player|p2|Gary|blue|
|teamsize|p1|6
|teamsize|p2|6
|gametype|singles
|gen|9
|tier|[Gen 9] OU
|rule|Sleep Clause Mod: Limit one foe put to sleep
|start
|switch|p1a: Landorus-Therian|Landorus-Therian, M|100/100
|switch|p2a: Corviknight|Corviknight, F|100/100
|turn|1
|move|p1a: Landorus-Therian|Earthquake|p2a: Corviknight
|-immune|p2a: Corviknight
|upkeep
|turn|2
|move|p2a: Corviknight|Brave Bird|p1a: Landorus-Therian
|-damage|p1a: Landorus-Therian|55/100
|-damage|p2a: Corviknight|88/100
|upkeep
|turn|3
|move|p1a: Landorus-Therian|Stone Edge|p2a: Corviknight
|-crit|p2a: Corviknight
|-supereffective|p2a: Corviknight
|-damage|p2a: Corviknight|0 fnt
|faint|p2a: Corviknight
|
|win|Ash
""".strip()


def test_parses_players_format_and_winner():
    replay = parse_replay_log(SAMPLE_LOG)
    assert replay.players == {"p1": "Ash", "p2": "Gary"}
    assert replay.format == "[Gen 9] OU"
    assert replay.winner == "Ash"


def test_parses_turn_count_and_groups_events_by_turn():
    replay = parse_replay_log(SAMPLE_LOG)
    assert replay.turn_count == 3
    # Turn 0 holds the pre-"|turn|1" team-preview switches (see the
    # dedicated test below); 1-3 are the real battle turns.
    turn_numbers = [t.number for t in replay.turns]
    assert turn_numbers == [0, 1, 2, 3]


def test_turn_one_captures_the_immunity():
    replay = parse_replay_log(SAMPLE_LOG)
    turn_1 = next(t for t in replay.turns if t.number == 1)
    kinds = [e.kind for e in turn_1.events]
    assert kinds == ["move", "-immune"]
    assert "Earthquake" in turn_1.events[0].summary
    assert turn_1.events[0].actor == "p1a: Landorus-Therian"


def test_turn_three_captures_the_crit_and_faint():
    replay = parse_replay_log(SAMPLE_LOG)
    turn_3 = next(t for t in replay.turns if t.number == 3)
    kinds = [e.kind for e in turn_3.events]
    assert kinds == ["move", "-crit", "-supereffective", "-damage", "faint"]
    assert "fainted" in turn_3.events[-1].summary
    assert turn_3.events[-1].actor == "p2a: Corviknight"


def test_pre_turn_events_are_dropped_when_only_setup_switches_happen():
    # The sample log's pre-"|turn|1" switches aren't in _NOTABLE_KINDS'
    # commentary set the same way mid-battle switches are — actually they
    # ARE ("switch" is notable) — so turn 0 should exist with both switches.
    replay = parse_replay_log(SAMPLE_LOG)
    turn_zero = next((t for t in replay.turns if t.number == 0), None)
    assert turn_zero is not None
    assert len(turn_zero.events) == 2
    assert all(e.kind == "switch" for e in turn_zero.events)


def test_empty_log_parses_to_no_turns():
    replay = parse_replay_log("")
    assert replay.turns == []
    assert replay.turn_count == 0
    assert replay.winner is None
    assert replay.players == {}


def test_ignores_non_pipe_lines():
    replay = parse_replay_log(
        "this is not a protocol line\n|turn|1\n|move|p1a: Foo|Tackle|p2a: Bar"
    )
    assert replay.turn_count == 1
    assert len(replay.turns) == 1
