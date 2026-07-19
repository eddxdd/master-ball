# RAG knowledge base — original content, not scraped

Every `.md` file in this directory (except this one) is a knowledge-base
document ingested by `scripts/ingest_knowledge_base.py` into pgvector for the
`retrieve_context` tool (see `Docs/ai-agents-and-rag.md` section 3 and
`Docs/backend/README.md`'s "RAG knowledge base" section).

**Why this is original, hand-written strategy content and not scraped Smogon
Strategy Dex prose:** Smogon's analyses are copyrighted editorial content
written by named contributors, not an open data feed intended for
redistribution the way PokeAPI's ability/move/item text is (which Phase 1
does fetch and cache verbatim, deliberately — see
`Docs/backend/README.md#ability-move-descriptions-real-data-only-never-a-hardcoded-stopgap`).
Bulk-copying and committing that prose into this repository would be a real
redistribution problem for a project explicitly aiming to be production-
grade, not a shortcut worth taking. The notes here synthesize the same kind
of real, accurate, generally-known competitive facts (typing, abilities,
common roles, checks/counters, teammates) in original wording, which is
exactly what an AI coach should be doing anyway — reasoning over grounded
facts, not reciting someone else's paragraph back verbatim.

**Document format** (parsed by `_parse_document` in the ingestion script —
deliberately not YAML frontmatter, since every field here is a single plain
string):

```
id: ou-some-pokemon
title: Some Pokemon — Strategy Notes
species_id: somepokemon
tags: pokemon_strategy, OU, some-type

Body text starts after the first blank line...
```

- `id` (required) — stable source id; re-running the ingestion script
  deletes and replaces exactly this document's chunks, so it's safe to edit
  a file and re-ingest without accumulating duplicates.
- `title` (required) — shown as the citation title in `retrieve_context`
  results.
- `species_id` (optional) — links a document to a real seeded `Species.id`
  for future cross-linking from the Pokedex UI.
- `tags` (optional, comma-separated) — free-form metadata for future
  `source_filter` support in `retrieve_context`.

**Adding a live source later:** the ingestion pipeline's shape (documents ->
LlamaIndex chunking -> fastembed embeddings -> pgvector upsert) doesn't
change to support a real external source — only `load_documents()` in
`scripts/ingest_knowledge_base.py` would need a new branch (e.g. a scheduled
fetch-and-parse job per `Docs/tech-stack.md`'s "batch ingestion over live
per-request calls" principle), not a pipeline rewrite.
