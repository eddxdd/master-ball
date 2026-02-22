/**
 * Games Routes
 * Endpoints for Wordle game management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { selectRandomPokemon } from '../services/cardGenerator.js';
import { generateFeedback, isGuessCorrect, calculateTier } from '../services/wordleLogic.js';
import { generateCardOffers } from '../services/cardGenerator.js';
import { updatePityTracker, getPityTracker } from '../services/pitySystem.js';
import { getSetDisplayName } from '../utils/cardDisplay.js';
import { enrichCardsWithBiomes } from '../utils/cardEnrichment.js';
import { xpForRarity, xpProgress, levelFromXp } from '../services/xpSystem.js';

const router = Router();

/**
 * GET /games/pokemon
 * Get all Pokemon (for autocomplete in game)
 */
router.get('/pokemon', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pokemon = await prisma.pokemon.findMany({
      select: {
        id: true,
        name: true,
        imageUrl: true
      },
      orderBy: {
        name: 'asc'
      }
    });
    
    res.json(pokemon);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /games
 * Start a new Wordle game
 */
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { biomeId, timeOfDay } = req.body;
    
    if (!biomeId || !timeOfDay) {
      return res.status(400).json({ error: 'biomeId and timeOfDay are required' });
    }
    
    if (!['day', 'night'].includes(timeOfDay)) {
      return res.status(400).json({ error: 'timeOfDay must be "day" or "night"' });
    }
    
    // Check if biome exists
    const biome = await prisma.biome.findUnique({
      where: { id: biomeId }
    });
    
    if (!biome) {
      return res.status(404).json({ error: 'Biome not found' });
    }
    
    // Select random Pokemon from biome (only those with cards)
    let pokemonId: number;
    try {
      pokemonId = await selectRandomPokemon(biomeId, timeOfDay);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No Pokemon available';
      if (message.includes('No Pokemon')) {
        return res.status(400).json({
          error: 'No Pokemon available for this biome right now. Try another biome or time of day.'
        });
      }
      throw err;
    }
    
    // Create game
    const game = await prisma.game.create({
      data: {
        userId,
        biomeId,
        timeOfDay,
        pokemonId
      },
      include: {
        biome: true
      }
    });
    
    res.status(201).json({
      id: game.id,
      biome: game.biome,
      timeOfDay: game.timeOfDay,
      guessesUsed: 0,
      maxGuesses: 6,
      completed: false,
      won: false,
      createdAt: game.createdAt
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /games/:id
 * Get game state
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const gameId = parseInt(req.params.id, 10);
    const userId = req.user!.id;
    
    if (isNaN(gameId)) {
      return res.status(400).json({ error: 'Invalid game ID' });
    }
    
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        biome: true,
        pokemon: true,
        guesses: {
          include: {
            pokemon: {
              select: {
                id: true,
                name: true,
                imageUrl: true
              }
            }
          },
          orderBy: {
            guessNum: 'asc'
          }
        }
      }
    });
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    if (game.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const isAdmin = req.user!.role === 'ADMIN';

    // Pity info for all users (for display on game page)
    const pity = await getPityTracker(userId);
    const pityInfo = {
      consecutiveTier6: pity.consecutiveTier6,
      consecutiveTier5: pity.consecutiveTier5,
      consecutiveTier4: pity.consecutiveTier4,
      consecutiveTier3: pity.consecutiveTier3,
      consecutiveTier2: pity.consecutiveTier2,
      gamesWithoutCeiling: pity.gamesWithoutCeiling,
      hardPityCounter: pity.hardPityCounter,
      totalGames: pity.totalGames,
    };
    
    // Format response
    const response: any = {
      id: game.id,
      biome: game.biome,
      timeOfDay: game.timeOfDay,
      guessesUsed: game.guessesUsed || 0,
      maxGuesses: 6,
      completed: game.completed,
      won: game.won,
      tier: game.tier,
      pity: pityInfo,
      guesses: game.guesses
        .filter((g: any) => g.pokemon != null)
        .map((g: any) => ({
        guessNum: g.guessNum,
        pokemon: {
          id: g.pokemon.id,
          name: g.pokemon.name,
          imageUrl: g.pokemon.imageUrl
        },
        feedback: g.feedback
      })),
      createdAt: game.createdAt
    };
    
    // Admin: always show answer (for testing/support)
    if (isAdmin) {
      response.answer = game.pokemon;
    }
    
    // Only show answer if game is completed (for non-admin, answer only when done)
    if (game.completed) {
      response.answer = game.pokemon;
      response.offeredCardIds = game.offeredCardIds;
      
      // Check if user has already captured a card for this game
      const capturedCard = await prisma.userCard.findUnique({
        where: { gameId: game.id }
      });
      
      if (capturedCard) {
        response.capturedCardId = capturedCard.cardId;
      }
      
      // Fetch offered cards if available
      if (game.offeredCardIds && Array.isArray(game.offeredCardIds)) {
        const cardIds = game.offeredCardIds as number[];
        const cards = await prisma.card.findMany({
          where: {
            id: { in: cardIds }
          },
          include: {
            pokemon: true
          }
        });
        // Preserve order: first card = guaranteed (answer's card), then random cards
        const idToCard = new Map(cards.map((c: any) => [c.id, c]));
        const orderedCards = cardIds
          .map((id: number) => idToCard.get(id))
          .filter(Boolean)
          .map((c: any) => ({ ...c, setDisplayName: getSetDisplayName(c.setId, c.imageUrl) }));
        response.offeredCards = await enrichCardsWithBiomes(orderedCards);
        response.guaranteedCardId = cardIds[0] ?? null;
        response.pityCardId = game.appliedPityTier != null ? (cardIds[1] ?? null) : null;
      } else if (!capturedCard) {
        // If no offeredCardIds but game is completed and not captured yet,
        // regenerate cards now
        console.log('Game completed without offeredCardIds, regenerating cards...');
        try {
          const { generateCardOffers } = await import('../services/cardGenerator.js');
          const { calculateTier } = await import('../services/wordleLogic.js');
          const tier = game.tier || calculateTier(game.guessesUsed || 6);
          const cardOffers = await generateCardOffers(userId, tier, game.pokemonId);
          
          // Update game with card IDs
          await prisma.game.update({
            where: { id: game.id },
            data: {
              offeredCardIds: cardOffers.cards.map(c => c.id) as any,
              tier
            }
          });
          
          const regeneratedCards = cardOffers.cards.map((c: any) => ({
            ...c,
            setDisplayName: getSetDisplayName(c.setId, c.imageUrl),
          }));
          response.offeredCards = await enrichCardsWithBiomes(regeneratedCards);
          response.offeredCardIds = cardOffers.cards.map(c => c.id);
          response.guaranteedCardId = cardOffers.guaranteedCard.id;
          response.pityCardId = cardOffers.appliedPityTier != null ? (cardOffers.cards[1]?.id ?? null) : null;
        } catch (error) {
          console.error('Failed to regenerate cards:', error);
        }
      }
    }
    
    res.json(response);
  } catch (error) {
    console.error('GET /games/:id error:', error);
    next(error);
  }
});

/**
 * POST /games/:id/guess
 * Submit a guess for the Wordle game
 */
router.post('/:id/guess', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const gameId = parseInt(req.params.id);
    const userId = req.user!.id;
    const { pokemonId } = req.body;
    
    if (isNaN(gameId)) {
      return res.status(400).json({ error: 'Invalid game ID' });
    }
    
    if (!pokemonId) {
      return res.status(400).json({ error: 'pokemonId is required' });
    }
    
    // Get game
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        pokemon: true,
        guesses: true
      }
    });
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    if (game.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    if (game.completed) {
      return res.status(400).json({ error: 'Game already completed' });
    }
    
    if (game.guesses.length >= 6) {
      return res.status(400).json({ error: 'Maximum guesses reached' });
    }
    
    // Get guessed Pokemon
    const guessPokemon = await prisma.pokemon.findUnique({
      where: { id: pokemonId }
    });
    
    if (!guessPokemon) {
      return res.status(404).json({ error: 'Pokemon not found' });
    }
    
    // Generate feedback
    const feedback = generateFeedback(guessPokemon, game.pokemon);
    const correct = isGuessCorrect(guessPokemon, game.pokemon);
    const guessNum = game.guesses.length + 1;
    
    // Create guess
    await prisma.guess.create({
      data: {
        gameId,
        guessNum,
        pokemonId,
        feedback: feedback as any
      }
    });
    
    // Update game if completed
    let updatedGame = game;
    let offeredCards = null;
    let guaranteedCardId: number | null = null;
    let pityCardId: number | null = null;
    
    if (correct || guessNum >= 6) {
      const tier = calculateTier(guessNum);
      
      // Generate card offers
      try {
        const cardOffers = await generateCardOffers(userId, tier, game.pokemonId);
        
        updatedGame = await prisma.game.update({
          where: { id: gameId },
          data: {
            completed: true,
            won: correct,
            guessesUsed: guessNum,
            tier,
            offeredCardIds: cardOffers.cards.map(c => c.id) as any,
            appliedPityTier: cardOffers.appliedPityTier ?? undefined
          },
          include: {
            pokemon: true
          }
        });
        
        const freshCards = cardOffers.cards.map((c: any) => ({
          ...c,
          setDisplayName: getSetDisplayName(c.setId, c.imageUrl),
        }));
        offeredCards = await enrichCardsWithBiomes(freshCards);
        guaranteedCardId = cardOffers.guaranteedCard.id;
        // First random card (index 1) is designated as the pity card when pity applied
        pityCardId = cardOffers.appliedPityTier != null ? (cardOffers.cards[1]?.id ?? null) : null;
      } catch (cardError) {
        console.error('Error generating card offers:', cardError);
        console.error('Card generation error details:', {
          error: cardError,
          message: cardError instanceof Error ? cardError.message : 'Unknown error',
          stack: cardError instanceof Error ? cardError.stack : undefined,
          userId,
          tier,
          pokemonId: game.pokemonId
        });
        // Still complete the game even if card generation fails
        updatedGame = await prisma.game.update({
          where: { id: gameId },
          data: {
            completed: true,
            won: correct,
            guessesUsed: guessNum,
            tier
          },
          include: {
            pokemon: true
          }
        });
      }
    }
    
    res.json({
      guess: {
        guessNum,
        pokemon: guessPokemon,
        feedback
      },
      gameCompleted: updatedGame.completed,
      won: updatedGame.won,
      tier: updatedGame.tier,
      answer: updatedGame.completed ? updatedGame.pokemon : null,
      offeredCards,
      guaranteedCardId,
      pityCardId
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /games/:id/capture
 * Capture one of the offered cards
 */
router.post('/:id/capture', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const gameId = parseInt(req.params.id);
    const userId = req.user!.id;
    const { cardId } = req.body;
    
    if (isNaN(gameId)) {
      return res.status(400).json({ error: 'Invalid game ID' });
    }
    
    if (!cardId) {
      return res.status(400).json({ error: 'cardId is required' });
    }
    
    // Get game
    const game = await prisma.game.findUnique({
      where: { id: gameId }
    });
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    if (game.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    if (!game.completed) {
      return res.status(400).json({ error: 'Game not completed yet' });
    }
    
    // Check if card already captured
    const existingCapture = await prisma.userCard.findUnique({
      where: { gameId }
    });
    
    if (existingCapture) {
      return res.status(400).json({ error: 'Card already captured for this game' });
    }
    
    // Verify card is in offered cards
    const offeredCardIds = game.offeredCardIds as number[];
    if (!offeredCardIds || !offeredCardIds.includes(cardId)) {
      return res.status(400).json({ error: 'Card not offered for this game' });
    }
    
    // Get the card
    const card = await prisma.card.findUnique({
      where: { id: cardId }
    });
    
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }
    
    // Create UserCard
    const userCard = await prisma.userCard.create({
      data: {
        userId,
        cardId,
        gameId
      },
      include: {
        card: true
      }
    });
    
    // Check before upserting whether this is a brand-new card for the user
    const existingPokedexEntry = await prisma.pokedexEntry.findUnique({
      where: { userId_cardId: { userId, cardId } },
    });
    const isNewCard = !existingPokedexEntry;

    // Create or update Pokedex entry
    await prisma.pokedexEntry.upsert({
      where: {
        userId_cardId: {
          userId,
          cardId
        }
      },
      update: {},
      create: {
        userId,
        cardId
      }
    });
    
    await updatePityTracker(userId, game.tier!, card.isCeiling, game.appliedPityTier ?? undefined);

    // XP is only awarded the first time a unique card is collected
    const xpGained = isNewCard ? xpForRarity(card.rarity) : 0;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { experience: true, level: true } });
    const prevXp = user?.experience ?? 0;
    const prevLevel = user?.level ?? 1;
    const newXp = prevXp + xpGained;
    const newLevel = Math.min(100, levelFromXp(newXp));
    const progress = xpProgress(newXp);

    if (xpGained > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { experience: newXp, level: newLevel },
      });
    }

    res.json({
      ...userCard,
      xpGained,
      levelInfo: {
        level: progress.level,
        currentXp: progress.currentXp,
        xpNeeded: progress.xpNeeded,
        progressPercent: progress.progressPercent,
        totalXp: newXp,
        leveledUp: newLevel > prevLevel,
        prevLevel,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /games/history
 * Get user's game history
 */
router.get('/history', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    
    const games = await prisma.game.findMany({
      where: {
        userId,
        completed: true
      },
      include: {
        biome: true,
        pokemon: true,
        capturedCard: {
          include: {
            card: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 50
    });
    
    res.json(games);
  } catch (error) {
    next(error);
  }
});

export default router;
