/**
 * Admin Routes
 * Protected endpoints for admin-only dashboard operations.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

/**
 * GET /admin/stats
 * Returns a high-level overview of the app for the admin dashboard.
 */
router.get('/stats', authenticate, requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [
      totalUsers,
      totalGames,
      totalCaptures,
      totalPokedexEntries,
      gamesLast7Days,
      recentUsers,
      topTrainers,
      rarityBreakdown,
    ] = await Promise.all([
      // Total registered users
      prisma.user.count(),

      // Total games ever played
      prisma.game.count({ where: { completed: true } }),

      // Total card captures
      prisma.userCard.count(),

      // Total unique pokedex entries across all users
      prisma.pokedexEntry.count(),

      // Completed games in the last 7 days
      prisma.game.count({
        where: {
          completed: true,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),

      // 5 most recently registered users
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, username: true, role: true, level: true, experience: true, createdAt: true },
      }),

      // Top 5 trainers by level then XP
      prisma.user.findMany({
        orderBy: [{ level: 'desc' }, { experience: 'desc' }],
        take: 5,
        select: { id: true, username: true, level: true, experience: true },
      }),

      // Card captures broken down by rarity
      prisma.userCard.groupBy({
        by: ['cardId'],
        _count: { cardId: true },
      }).then(async (rows) => {
        // Fetch rarity for each card id then aggregate
        const cardIds = rows.map((r) => r.cardId);
        const cards = await prisma.card.findMany({
          where: { id: { in: cardIds } },
          select: { id: true, rarity: true },
        });
        const rarityMap = new Map(cards.map((c) => [c.id, c.rarity]));
        const agg: Record<string, number> = {};
        for (const row of rows) {
          const rarity = rarityMap.get(row.cardId) ?? 'Unknown';
          agg[rarity] = (agg[rarity] ?? 0) + row._count.cardId;
        }
        return Object.entries(agg)
          .map(([rarity, count]) => ({ rarity, count }))
          .sort((a, b) => b.count - a.count);
      }),
    ]);

    res.json({
      totals: {
        users: totalUsers,
        gamesCompleted: totalGames,
        captures: totalCaptures,
        pokedexEntries: totalPokedexEntries,
        gamesLast7Days,
      },
      recentUsers,
      topTrainers,
      rarityBreakdown,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
