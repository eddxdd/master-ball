/**
 * Biomes Routes
 * Endpoints for biome selection and Pokemon spawns
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

/**
 * GET /biomes
 * Get all biomes
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const biomes = await prisma.biome.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        imageUrl: true
      }
    });
    
    return res.json(biomes);
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /biomes/:id
 * Get a specific biome
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const biomeId = parseInt(req.params.id);
    
    if (isNaN(biomeId)) {
      return res.status(400).json({ error: 'Invalid biome ID' });
    }
    
    const biome = await prisma.biome.findUnique({
      where: { id: biomeId },
      include: {
        spawns: {
          include: {
            pokemon: true
          }
        }
      }
    });
    
    if (!biome) {
      return res.status(404).json({ error: 'Biome not found' });
    }
    
    return res.json(biome);
  } catch (error) {
    return next(error);
  }
});

/**
 * GET /biomes/:id/pokemon?timeOfDay=day|night
 * Get available Pokemon for a biome at a specific time of day
 */
router.get('/:id/pokemon', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const biomeId = parseInt(req.params.id);
    const timeOfDay = req.query.timeOfDay as string;
    
    if (isNaN(biomeId)) {
      return res.status(400).json({ error: 'Invalid biome ID' });
    }
    
    if (!timeOfDay || !['day', 'night'].includes(timeOfDay)) {
      return res.status(400).json({ error: 'timeOfDay must be "day" or "night"' });
    }
    
    const spawns = await prisma.pokemonSpawn.findMany({
      where: {
        biomeId,
        OR: [
          { timeOfDay },
          { timeOfDay: 'both' }
        ]
      },
      include: {
        pokemon: true
      }
    });
    
    const pokemon = spawns.map((s: any) => s.pokemon);
    
    return res.json(pokemon);
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /biomes (Admin only)
 * Create a new biome
 */
router.post('/', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, imageUrl } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const biome = await prisma.biome.create({
      data: {
        name,
        description: description || null,
        imageUrl: imageUrl || null
      }
    });
    
    return res.status(201).json(biome);
  } catch (error) {
    return next(error);
  }
});

/**
 * PATCH /biomes/:id (Admin only)
 * Update a biome
 */
router.patch('/:id', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const biomeId = parseInt(req.params.id);
    const { name, description, imageUrl } = req.body;
    
    if (isNaN(biomeId)) {
      return res.status(400).json({ error: 'Invalid biome ID' });
    }
    
    const biome = await prisma.biome.update({
      where: { id: biomeId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(imageUrl !== undefined && { imageUrl })
      }
    });
    
    return res.json(biome);
  } catch (error) {
    return next(error);
  }
});

/**
 * DELETE /biomes/:id (Admin only)
 * Delete a biome
 */
router.delete('/:id', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const biomeId = parseInt(req.params.id);
    
    if (isNaN(biomeId)) {
      return res.status(400).json({ error: 'Invalid biome ID' });
    }
    
    await prisma.biome.delete({
      where: { id: biomeId }
    });
    
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
