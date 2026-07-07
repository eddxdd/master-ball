# DexTrAIner

*Working title — see [`Docs/README.md`](./Docs/README.md#naming--branding).*

An AI-powered competitive Pokémon companion: the **Dex** — a fast, accurate Pokédex, Team Builder, and Damage Calculator — plus the **TrAIner** — an AI layer that reasons in plain English about your team and matchups, and helps with the mental-game side of laddering.

## Running locally

```bash
cp .env.example .env
docker compose up
```

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend API: [http://localhost:8000](http://localhost:8000) (health check at `/health`)

See [`Docs/setup.md`](./Docs/setup.md) for prerequisites, environment variables, and troubleshooting.

## Documentation

Full project documentation — product research, tech stack, architecture, the AI/RAG layer, and the phased roadmap — lives in [`Docs/`](./Docs/README.md). Start there for anything beyond "how do I run this."
