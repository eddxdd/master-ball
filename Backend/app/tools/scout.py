"""scout_opponent — Phase 5's tool composing lookup_meta_stats (real usage
data: what set/teammates/Tera type this Pokemon is *actually* running on
ladder right now) with retrieve_context (this app's own strategy notes on
how to beat it), for the "what should I expect from the opposing X" question.
See Docs/roadmap.md's Phase 5 section and Docs/ai-agents-and-rag.md's tool
table.

Deliberately a thin composition of two already-real tools, not a new data
source or a third LLM call — the agent's synthesizer does the actual
reasoning over both pieces together.
"""

from poke_env.data.normalize import to_id_str
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.meta import ScoutReport
from app.tools.meta_stats import DEFAULT_FORMAT, lookup_meta_stats
from app.tools.retrieval import retrieve_context


async def scout_opponent(
    db: AsyncSession, species_name: str, format: str = DEFAULT_FORMAT
) -> ScoutReport:
    species_id = to_id_str(species_name)
    meta = await lookup_meta_stats(db, species_id, format)

    display_name = meta.species_name if meta else species_name
    retrieval = await retrieve_context(
        db, f"How to play against {display_name}, its checks and counters"
    )

    return ScoutReport(
        species_id=species_id,
        meta_stats=meta,
        strategy_notes=[chunk.title for chunk in retrieval.chunks],
    )
