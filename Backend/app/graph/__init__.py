"""Phase 6's knowledge-graph layer — a Neo4j graph of Pokemon/types/moves/
abilities/items plus real usage-derived teammate/counter edges, queried for
"what pairs well with X" / "what beats X" style questions that a plain
vector-RAG lookup or a single SQL join can't answer as naturally as a graph
traversal can. See scripts/load_graph.py (the loader), app/tools/graph_query.py
(the traversal queries), and Docs/backend/README.md's "Knowledge graph
(Phase 6)" section.
"""
