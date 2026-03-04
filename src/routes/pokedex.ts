/**
 * Pokedex Routes
 * Endpoints for card collection management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { getSetDisplayName, getLocalCardImageUrl } from '../utils/cardDisplay.js';
import { enrichCardsWithBiomes } from '../utils/cardEnrichment.js';

const router = Router();

/**
 * GET /pokedex
 * Get user's Pokedex (all cards with capture status)
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'ADMIN';
    
    // Get all cards, ordered so the best (lowest tier = rarest) card per unique
    // image comes first — we'll deduplicate below.
    const allCards = await prisma.card.findMany({
      include: { pokemon: true },
      orderBy: [
        { pokemon: { pokedexNumber: 'asc' } },
        { tier: 'asc' },
      ],
    });

    // Get user's captured card IDs (a Set for O(1) lookup)
    const capturedEntries = await prisma.pokedexEntry.findMany({
      where: { userId },
      select: { cardId: true, discovered: true },
    });
    const capturedMap = new Map(
      capturedEntries.map(entry => [entry.cardId, entry.discovered])
    );

    // Get copy counts per cardId for this user
    const userCardCounts = await prisma.userCard.groupBy({
      by: ['cardId'],
      where: { userId },
      _count: { id: true },
    });
    const countByCardId = new Map(
      userCardCounts.map(row => [row.cardId, row._count.id])
    );

    // Deduplicate: show one card per unique (pokemonId, setId) so we never show
    // the same Pokémon+set twice (e.g. same Bulbasaur card in tier 4 and 5).
    // Order is already by pokedexNumber then tier asc, so first occurrence is the rarest tier.
    const seen = new Set<string>();
    const pokedex: any[] = [];

    for (const card of allCards) {
      const setKey = card.setId ?? '';
      const key = `${card.pokemonId}::${setKey}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // All cards that are the same Pokémon + set (tier variants)
      const siblings = allCards.filter(
        c => c.pokemonId === card.pokemonId && (c.setId ?? '') === setKey
      );
      const isCaptured = isAdmin || siblings.some(c => capturedMap.has(c.id));
      const discovered = siblings
        .map(c => capturedMap.get(c.id))
        .filter(Boolean)[0] ?? null;

      // Sum copies across all sibling card IDs
      const quantity = siblings.reduce((sum, c) => sum + (countByCardId.get(c.id) ?? 0), 0);

      const resolved = getLocalCardImageUrl(card);
      pokedex.push({
        card: {
          ...card,
          imageUrl: resolved.imageUrl,
          imageUrlLarge: resolved.imageUrlLarge,
          setDisplayName: getSetDisplayName(card.setId, resolved.imageUrl),
        },
        captured: isCaptured,
        discovered,
        quantity,
      });
    }

    // Enrich all cards with biome names in one batch query
    const enrichedCards = await enrichCardsWithBiomes(pokedex.map((e) => e.card));
    const enrichedPokedex = pokedex.map((entry, i) => ({
      ...entry,
      card: enrichedCards[i],
    }));

    res.json(enrichedPokedex);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /pokedex/stats
 * Get collection statistics
 */
router.get('/stats', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    
    // Total cards in database
    const totalCards = await prisma.card.count();
    
    // User's collected cards
    const collectedCards = await prisma.pokedexEntry.count({
      where: { userId }
    });
    
    // Cards by rarity
    const cardsByRarity = await prisma.pokedexEntry.groupBy({
      by: ['cardId'],
      where: { userId },
      _count: true
    });
    
    const rarityStats = await Promise.all(
      cardsByRarity.map(async (entry: any) => {
        const card = await prisma.card.findUnique({
          where: { id: entry.cardId },
          select: { rarity: true }
        });
        return card?.rarity;
      })
    );
    
    const rarityCounts = rarityStats.reduce((acc: Record<string, number>, rarity: string | undefined) => {
      if (rarity) {
        acc[rarity] = (acc[rarity] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    
    // Cards by biome (through games)
    const biomeStats = await prisma.game.groupBy({
      by: ['biomeId'],
      where: {
        userId,
        completed: true,
        won: true
      },
      _count: true
    });
    
    const biomeData = await Promise.all(
      biomeStats.map(async (stat: any) => {
        const biome = await prisma.biome.findUnique({
          where: { id: stat.biomeId },
          select: { name: true }
        });
        return {
          biome: biome?.name || 'Unknown',
          count: stat._count
        };
      })
    );
    
    // Rarest card owned
    const entries = await prisma.pokedexEntry.findMany({
      where: { userId },
      include: {
        card: true
      },
      orderBy: {
        discovered: 'desc'
      }
    });
    
    const rarestCard = entries.reduce((rarest: typeof entries[0] | null, entry: typeof entries[0]) => {
      const tierValue = entry.card.tier;
      if (!rarest || tierValue < rarest.card.tier) {
        return entry;
      }
      return rarest;
    }, null as typeof entries[0] | null);

    const rarestCardResolved = rarestCard?.card
      ? (() => { const r = getLocalCardImageUrl(rarestCard.card); return { ...rarestCard.card, imageUrl: r.imageUrl, imageUrlLarge: r.imageUrlLarge }; })()
      : null;

    res.json({
      totalCards,
      collectedCards,
      completionPercentage: Math.round((collectedCards / totalCards) * 100),
      cardsByRarity: rarityCounts,
      cardsByBiome: biomeData,
      rarestCard: rarestCardResolved
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /pokedex/collection
 * Get the user's owned UserCards (with card details), grouped by cardId.
 * Useful for selecting a card to offer in an auction.
 * Excludes cards already locked in an active auction.
 * Must be registered before /:cardId to avoid routing conflicts.
 */
router.get('/collection', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const userCards = await prisma.userCard.findMany({
      where: {
        userId,
        offeredInAuction: null,
      },
      include: {
        card: { include: { pokemon: true } },
      },
      orderBy: { obtained: 'desc' },
    });

    // Group by cardId to provide quantity info
    const grouped: Record<number, { card: any; quantity: number; instances: { id: number; obtained: Date }[] }> = {};

    for (const uc of userCards) {
      const cardId = uc.cardId;
      const resolved = getLocalCardImageUrl(uc.card);
      if (!grouped[cardId]) {
        grouped[cardId] = {
          card: {
            ...uc.card,
            imageUrl: resolved.imageUrl,
            imageUrlLarge: resolved.imageUrlLarge,
            setDisplayName: getSetDisplayName(uc.card.setId, resolved.imageUrl),
          },
          quantity: 0,
          instances: [],
        };
      }
      grouped[cardId].quantity += 1;
      grouped[cardId].instances.push({ id: uc.id, obtained: uc.obtained });
    }

    res.json(Object.values(grouped));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /pokedex/:cardId
 * Get details about a specific card in the Pokedex
 */
router.get('/:cardId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const cardId = parseInt(req.params.cardId);
    
    if (isNaN(cardId)) {
      res.status(400).json({ error: 'Invalid card ID' }); return;
    }
    
    const entry = await prisma.pokedexEntry.findUnique({
      where: {
        userId_cardId: {
          userId,
          cardId
        }
      },
      include: {
        card: {
          include: {
            pokemon: true
          }
        }
      }
    });
    
    if (!entry) {
      res.status(404).json({ error: 'Card not in your Pokedex' }); return;
    }
    
    // Get all instances of this card owned by user
    const userCards = await prisma.userCard.findMany({
      where: {
        userId,
        cardId
      },
      include: {
        game: {
          include: {
            biome: true
          }
        }
      },
      orderBy: {
        obtained: 'desc'
      }
    });
    
    const resolved = getLocalCardImageUrl(entry.card);
    res.json({
      ...entry,
      card: {
        ...entry.card,
        imageUrl: resolved.imageUrl,
        imageUrlLarge: resolved.imageUrlLarge,
        setDisplayName: getSetDisplayName(entry.card.setId, resolved.imageUrl),
      },
      instances: userCards
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /pokedex/cards/all (Admin only - for testing)
 * Get all cards in the system
 */
router.get('/cards/all', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const cards = await prisma.card.findMany({
      include: {
        pokemon: true
      },
      orderBy: [
        { tier: 'asc' },
        { pokemonName: 'asc' }
      ]
    });

    const withLocalUrls = cards.map((c) => {
      const resolved = getLocalCardImageUrl(c);
      return { ...c, imageUrl: resolved.imageUrl, imageUrlLarge: resolved.imageUrlLarge };
    });
    res.json(withLocalUrls);
  } catch (error) {
    next(error);
  }
});

export default router;
