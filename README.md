# Master Ball

A Pokemon-themed Wordle game where you guess Pokemon by attributes and collect TCG cards. React 19 + Express + PostgreSQL.

## Features

- **Wordle-style guessing** – 6 tries, 6 attributes (type, evolution, color, generation, etc.)
- **9 biomes** with day/night spawns
- **TCG card collection** – tier-based rewards, pity system, 12 rarity tiers
- **Pokedex** – track collection; **Auction House** – trade cards (max 3 active listings)
- **Profiles** – avatars, banners, levels/XP (XP for new unique cards only)

## Tech Stack

**Frontend:** React 19, TypeScript, Vite  
**Backend:** Node 22+, Express 5, JWT, bcrypt  
**Database:** PostgreSQL, Prisma ORM  
**APIs:** TCGdex (cards), PokeAPI (Pokemon)

## Prerequisites

- Node.js 22+
- PostgreSQL 14+
- npm

## Quick Start

```bash
git clone <repo-url>
cd master-ball
npm install
```

Create `.env` in the root:

```env
PORT=4000
NODE_ENV=development
JWT_SECRET=your-secret-key
DATABASE_URL=postgresql://user:password@localhost:5432/master_ball?schema=public
FRONTEND_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173
```

Database setup:

```bash
createdb master_ball
npm run prisma:migrate
npm run prisma:generate
```

Optional seed:

```bash
tsx src/scripts/seedWordle.ts
```

Optional card images (zips in `frontend/public/images/cards/`):

```bash
npm run cards:use-local
npm run cards:sync-local   # sync DB image URLs from local sets (e.g. promo/ancientmew for Mew)
```

Run the app:

```bash
npm run dev
```

- API: http://localhost:4000  
- Frontend: http://localhost:5173  
- Prisma Studio: `npm run prisma:studio` → http://localhost:5555

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Backend + frontend |
| `npm run build` | Build backend |
| `npm run start` | Run production server |
| `npm run prisma:migrate` | Run migrations |
| `npm run prisma:studio` | DB UI |
| `npm run cards:sync-local` | Sync card image URLs from local folders |

## License

ISC

---

Pokemon and Pokemon TCG are trademarks of their owners. Card data: [TCGdex](https://www.tcgdex.net/). Pokemon data: [PokeAPI](https://pokeapi.co/). Educational use only.
