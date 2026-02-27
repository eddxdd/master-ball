/**
 * Enhanced seed script to ensure ALL 151 Kanto Pokemon have cards
 * - Fetches multiple cards per Pokemon
 * - Tries alternate names for TCGdex
 * - Creates placeholder cards using PokeAPI sprites for missing Pokemon
 */

import 'dotenv/config';
import { prisma } from '../lib/prisma.js';
import { fetchProcessedCardsByPokemon } from '../services/tcgdex.js';
import { normalizeRarity, getAllTiersForCard, getWeightForRarity, isFloorCard, isCeilingCard } from '../services/cardTiers.js';

// Name variations for TCGdex searches
const NAME_VARIATIONS: Record<string, string[]> = {
  'nidoran-f': ['nidoran♀', 'nidoran-f', 'nidoran female'],
  'nidoran-m': ['nidoran♂', 'nidoran-m', 'nidoran male'],
  'mr-mime': ['mr. mime', 'mr-mime', 'mr mime'],
  'farfetchd': ["farfetch'd", 'farfetchd', 'farfetch']
};

async function seedCardsEnhanced() {
  console.log('🎴 Enhanced Card Seeding for ALL 151 Kanto Pokemon\n');
  
  const allPokemon = await prisma.pokemon.findMany({
    where: { generation: 1 },
    orderBy: { pokedexNumber: 'asc' }
  });
  
  console.log(`Found ${allPokemon.length} Kanto Pokemon\n`);
  
  let successCount = 0;
  let placeholderCount = 0;
  let totalCards = 0;
  
  for (const pokemon of allPokemon) {
    try {
      console.log(`Processing ${pokemon.name} (#${pokemon.pokedexNumber})...`);
      
      // Check if already has cards
      const existingCards = await prisma.card.count({
        where: { pokemonId: pokemon.id }
      });
      
      if (existingCards > 0) {
        console.log(`  ✓ Already has ${existingCards} cards, skipping\n`);
        successCount++;
        totalCards += existingCards;
        continue;
      }
      
      // Try fetching from TCGdex with name variations
      const namesToTry = NAME_VARIATIONS[pokemon.name] || [pokemon.name];
      let cards: any[] = [];
      
      for (const nameVariant of namesToTry) {
        try {
          cards = await fetchProcessedCardsByPokemon(nameVariant);
          if (cards.length > 0) {
            console.log(`  ✓ Found ${cards.length} cards using name: "${nameVariant}"`);
            break;
          }
        } catch (error) {
          // Try next variant
        }
      }
      
      // Filter valid cards with images
      const validCards = cards.filter(card => card.imageUrl && card.imageUrl !== '');
      
      if (validCards.length > 0) {
        // Use multiple cards (up to 5) to give variety
        const cardsToUse = validCards.slice(0, 5);
        
        for (const cardData of cardsToUse) {
          const normalizedRarity = normalizeRarity(cardData.rarity);
          const tiers = getAllTiersForCard(normalizedRarity);
          
          // Create card for each possible tier
          for (const tier of tiers) {
            const weight = getWeightForRarity(normalizedRarity);
            const isFloor = isFloorCard(normalizedRarity, tier);
            const isCeiling = isCeilingCard(normalizedRarity, tier);
            
            await prisma.card.create({
              data: {
                tcgdexId: `${cardData.tcgdexId}-t${tier}`,
                pokemonId: pokemon.id,
                pokemonName: pokemon.name,
                setId: cardData.setId,
                setName: cardData.setName,
                rarity: normalizedRarity,
                tier,
                imageUrl: cardData.imageUrl,
                imageUrlLarge: cardData.imageUrlLarge,
                weight,
                isFloor,
                isCeiling
              }
            });
            
            totalCards++;
          }
        }
        
        console.log(`  ✓ Created ${cardsToUse.length} card variants\n`);
        successCount++;
      } else {
        // No TCGdex cards found - create placeholder card using PokeAPI sprite
        console.log(`  ⚠ No TCGdex cards found, creating placeholder...`);
        
        // Create a Common card for all tiers
        for (let tier = 1; tier <= 6; tier++) {
          await prisma.card.create({
            data: {
              tcgdexId: `placeholder-${pokemon.name}-t${tier}`,
              pokemonId: pokemon.id,
              pokemonName: pokemon.name,
              setId: 'PLACEHOLDER',
              setName: 'Placeholder Set',
              rarity: 'Common',
              tier,
              imageUrl: pokemon.imageUrl ?? '',
              imageUrlLarge: pokemon.imageUrl ?? '',
              weight: 10.0,
              isFloor: true,
              isCeiling: false
            }
          });
          
          totalCards++;
        }
        
        console.log(`  ✓ Created placeholder card (will use PokeAPI sprite)\n`);
        placeholderCount++;
      }
      
      // Delay to respect API rate limits
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (error) {
      console.error(`  ✗ Error processing ${pokemon.name}:`, error);
    }
  }
  
  console.log('\n=== Summary ===');
  console.log(`✓ ${successCount} Pokemon with TCGdex cards`);
  console.log(`⚠ ${placeholderCount} Pokemon with placeholder cards`);
  console.log(`📦 ${totalCards} total cards created`);
}

async function main() {
  try {
    await seedCardsEnhanced();
    console.log('\n✓ Enhanced card seeding completed!');
  } catch (error) {
    console.error('Seed failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
