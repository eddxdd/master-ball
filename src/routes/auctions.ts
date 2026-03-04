/**
 * Auction House Routes
 * Endpoints for the public card trading auction system
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { xpForRarity, levelFromXp, xpProgress } from '../services/xpSystem.js';
import { getLocalCardImageUrl } from '../utils/cardDisplay.js';

const router = Router();

const MAX_ACTIVE_AUCTIONS = 3;
const AUCTION_DURATION_DAYS = 7;

const offeredUserCardInclude = {
  card: {
    include: { pokemon: true },
  },
  user: { select: { id: true, username: true } },
} as const;

const auctionInclude = {
  offeredUserCard: { include: offeredUserCardInclude },
  wantedCard: { include: { pokemon: true } },
  creator: { select: { id: true, username: true } },
  completedBy: { select: { id: true, username: true } },
} as const;

/**
 * GET /auctions
 * List all active auctions not created by the current user.
 * Includes a flag indicating whether the requesting user can fulfill each one.
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const now = new Date();

    const auctions = await prisma.auction.findMany({
      where: {
        status: 'active',
        creatorId: { not: userId },
        expiresAt: { gt: now },
      },
      include: auctionInclude,
      orderBy: { createdAt: 'desc' },
    });

    // For each auction, check if the requesting user owns the wanted card (and it's not locked in another auction)
    const wantedCardIds = [...new Set(auctions.map((a) => a.wantedCardId))];

    const ownedCards = await prisma.userCard.findMany({
      where: {
        userId,
        cardId: { in: wantedCardIds },
        offeredInAuction: null,
      },
      select: { cardId: true, id: true },
    });

    const ownedCardIdSet = new Set(ownedCards.map((c) => c.cardId));

    const result = auctions.map((auction) => {
      const offeredResolved = getLocalCardImageUrl(auction.offeredUserCard.card);
      const wantedResolved = getLocalCardImageUrl(auction.wantedCard);
      return {
        ...auction,
        offeredUserCard: {
          ...auction.offeredUserCard,
          card: { ...auction.offeredUserCard.card, imageUrl: offeredResolved.imageUrl, imageUrlLarge: offeredResolved.imageUrlLarge },
        },
        wantedCard: { ...auction.wantedCard, imageUrl: wantedResolved.imageUrl, imageUrlLarge: wantedResolved.imageUrlLarge },
        canFulfill: ownedCardIdSet.has(auction.wantedCardId),
      };
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /auctions/my
 * List the current user's auctions (all statuses).
 */
router.get('/my', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const auctions = await prisma.auction.findMany({
      where: { creatorId: userId },
      include: auctionInclude,
      orderBy: { createdAt: 'desc' },
    });

    const withResolvedImages = auctions.map((auction) => {
      const offeredResolved = getLocalCardImageUrl(auction.offeredUserCard.card);
      const wantedResolved = getLocalCardImageUrl(auction.wantedCard);
      return {
        ...auction,
        offeredUserCard: {
          ...auction.offeredUserCard,
          card: { ...auction.offeredUserCard.card, imageUrl: offeredResolved.imageUrl, imageUrlLarge: offeredResolved.imageUrlLarge },
        },
        wantedCard: { ...auction.wantedCard, imageUrl: wantedResolved.imageUrl, imageUrlLarge: wantedResolved.imageUrlLarge },
      };
    });

    res.json(withResolvedImages);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auctions
 * Create a new auction listing.
 * Body: { offeredUserCardId: number, wantedCardId: number }
 */
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { offeredUserCardId, wantedCardId } = req.body;

    if (!offeredUserCardId || !wantedCardId) {
      res.status(400).json({ error: 'offeredUserCardId and wantedCardId are required' }); return;
    }

    if (typeof offeredUserCardId !== 'number' || typeof wantedCardId !== 'number') {
      res.status(400).json({ error: 'offeredUserCardId and wantedCardId must be numbers' }); return;
    }

    // Verify the offered UserCard belongs to this user and is not already locked
    const offeredUserCard = await prisma.userCard.findUnique({
      where: { id: offeredUserCardId },
      include: { card: true, offeredInAuction: true },
    });

    if (!offeredUserCard) {
      res.status(404).json({ error: 'Card not found' }); return;
    }

    if (offeredUserCard.userId !== userId) {
      res.status(403).json({ error: 'You do not own this card' }); return;
    }

    if (offeredUserCard.offeredInAuction) {
      res.status(409).json({ error: 'This card is already listed in an active auction' }); return;
    }

    // Verify the wanted card exists
    const wantedCard = await prisma.card.findUnique({ where: { id: wantedCardId } });
    if (!wantedCard) {
      res.status(404).json({ error: 'Wanted card not found' }); return;
    }

    // Cannot request the same card type as what you're offering
    if (offeredUserCard.cardId === wantedCardId) {
      res.status(400).json({ error: 'You cannot trade a card for the same card' }); return;
    }

    // Enforce 3-auction limit
    const activeAuctionCount = await prisma.auction.count({
      where: { creatorId: userId, status: 'active' },
    });

    if (activeAuctionCount >= MAX_ACTIVE_AUCTIONS) {
      res.status(409).json({ error: `You can only have ${MAX_ACTIVE_AUCTIONS} active auctions at a time` }); return;
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + AUCTION_DURATION_DAYS);

    const auction = await prisma.auction.create({
      data: {
        creatorId: userId,
        offeredUserCardId,
        wantedCardId,
        expiresAt,
      },
      include: auctionInclude,
    });

    const offeredResolved = getLocalCardImageUrl(auction.offeredUserCard.card);
    const wantedResolved = getLocalCardImageUrl(auction.wantedCard);
    res.status(201).json({
      ...auction,
      offeredUserCard: {
        ...auction.offeredUserCard,
        card: { ...auction.offeredUserCard.card, imageUrl: offeredResolved.imageUrl, imageUrlLarge: offeredResolved.imageUrlLarge },
      },
      wantedCard: { ...auction.wantedCard, imageUrl: wantedResolved.imageUrl, imageUrlLarge: wantedResolved.imageUrlLarge },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /auctions/:id/accept
 * Accept/fulfill an auction by providing the wanted card.
 * Body: { userCardId: number } - the UserCard the accepting user will give
 */
router.post('/:id/accept', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const auctionId = parseInt(req.params.id, 10);
    const { userCardId } = req.body;

    if (isNaN(auctionId)) {
      res.status(400).json({ error: 'Invalid auction ID' }); return;
    }

    if (!userCardId || typeof userCardId !== 'number') {
      res.status(400).json({ error: 'userCardId is required and must be a number' }); return;
    }

    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        offeredUserCard: { include: { card: true } },
        wantedCard: true,
      },
    });

    if (!auction) {
      res.status(404).json({ error: 'Auction not found' }); return;
    }

    if (auction.status !== 'active') {
      res.status(409).json({ error: 'This auction is no longer active' }); return;
    }

    if (new Date() > auction.expiresAt) {
      res.status(409).json({ error: 'This auction has expired' }); return;
    }

    if (auction.creatorId === userId) {
      res.status(400).json({ error: 'You cannot accept your own auction' }); return;
    }

    // Verify the accepting user owns the given UserCard, it matches the wanted card, and is not locked
    const acceptorCard = await prisma.userCard.findUnique({
      where: { id: userCardId },
      include: { offeredInAuction: true, card: true },
    });

    if (!acceptorCard) {
      res.status(404).json({ error: 'Your card was not found' }); return;
    }

    if (acceptorCard.userId !== userId) {
      res.status(403).json({ error: 'You do not own this card' }); return;
    }

    if (acceptorCard.cardId !== auction.wantedCardId) {
      res.status(400).json({ error: 'This card does not match what the auction requests' }); return;
    }

    if (acceptorCard.offeredInAuction) {
      res.status(409).json({ error: 'This card is already locked in another auction' }); return;
    }

    // Check BEFORE the swap whether each party is receiving a card they've never owned.
    // XP is only awarded for the first time a unique card is collected.
    const [acceptorExistingEntry, creatorExistingEntry] = await Promise.all([
      prisma.pokedexEntry.findUnique({
        where: { userId_cardId: { userId: userId, cardId: auction.offeredUserCard.cardId } },
      }),
      prisma.pokedexEntry.findUnique({
        where: { userId_cardId: { userId: auction.creatorId, cardId: acceptorCard.cardId } },
      }),
    ]);
    const acceptorGetsNewCard = !acceptorExistingEntry;
    const creatorGetsNewCard = !creatorExistingEntry;

    // Perform the swap in a transaction
    await prisma.$transaction([
      // Transfer offered card from creator to acceptor
      prisma.userCard.update({
        where: { id: auction.offeredUserCardId },
        data: { userId: userId },
      }),
      // Transfer acceptor's card to creator
      prisma.userCard.update({
        where: { id: userCardId },
        data: { userId: auction.creatorId },
      }),
      // Mark auction as completed
      prisma.auction.update({
        where: { id: auctionId },
        data: {
          status: 'completed',
          completedById: userId,
          completedUserCardId: userCardId,
        },
      }),
    ]);

    // Upsert PokedexEntry for both parties
    await prisma.pokedexEntry.upsert({
      where: { userId_cardId: { userId: userId, cardId: auction.offeredUserCard.cardId } },
      create: { userId: userId, cardId: auction.offeredUserCard.cardId },
      update: {},
    });

    await prisma.pokedexEntry.upsert({
      where: { userId_cardId: { userId: auction.creatorId, cardId: acceptorCard.cardId } },
      create: { userId: auction.creatorId, cardId: acceptorCard.cardId },
      update: {},
    });

    // Award XP for newly collected unique cards
    const awardXp = async (recipientId: number, cardRarity: string) => {
      const xpGained = xpForRarity(cardRarity);
      const user = await prisma.user.findUnique({
        where: { id: recipientId },
        select: { experience: true },
      });
      const newXp = (user?.experience ?? 0) + xpGained;
      const newLevel = Math.min(100, levelFromXp(newXp));
      await prisma.user.update({
        where: { id: recipientId },
        data: { experience: newXp, level: newLevel },
      });
      return { xpGained, newXp, levelInfo: xpProgress(newXp) };
    };

    let acceptorXp: { xpGained: number; newXp: number; levelInfo: ReturnType<typeof xpProgress> } | null = null;
    if (acceptorGetsNewCard) {
      acceptorXp = await awardXp(userId, auction.offeredUserCard.card.rarity);
    }
    if (creatorGetsNewCard) {
      await awardXp(auction.creatorId, acceptorCard.card.rarity);
    }

    res.json({
      message: 'Trade completed successfully',
      xpGained: acceptorXp?.xpGained ?? 0,
      levelInfo: acceptorXp
        ? {
            level: acceptorXp.levelInfo.level,
            currentXp: acceptorXp.levelInfo.currentXp,
            xpNeeded: acceptorXp.levelInfo.xpNeeded,
            progressPercent: acceptorXp.levelInfo.progressPercent,
            totalXp: acceptorXp.newXp,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /auctions/:id
 * Cancel an active auction (creator only).
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const auctionId = parseInt(req.params.id, 10);

    if (isNaN(auctionId)) {
      res.status(400).json({ error: 'Invalid auction ID' }); return;
    }

    const auction = await prisma.auction.findUnique({ where: { id: auctionId } });

    if (!auction) {
      res.status(404).json({ error: 'Auction not found' }); return;
    }

    if (auction.creatorId !== userId) {
      res.status(403).json({ error: 'You can only cancel your own auctions' }); return;
    }

    if (auction.status !== 'active') {
      res.status(409).json({ error: 'Only active auctions can be cancelled' }); return;
    }

    await prisma.auction.update({
      where: { id: auctionId },
      data: { status: 'cancelled' },
    });

    res.json({ message: 'Auction cancelled successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
