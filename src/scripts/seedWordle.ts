/**
 * Seed Script for Pokemon Wordle TCG
 * Populates database with biomes, Pokemon, and cards
 */

import 'dotenv/config';
import { prisma } from '../lib/prisma.js';
import { fetchPokemonBatch } from '../services/pokeapi.js';
import { fetchProcessedCardsByPokemon } from '../services/tcgdex.js';
import {
  normalizeRarity,
  getAllTiersForCard,
  getWeightForRarity,
  isFloorCard,
  isCeilingCard
} from '../services/cardTiers.js';
import { KANTO_151_NAMES } from '../data/kanto151.js';

// TCGdex name variants (Bulbapedia/PokeAPI name -> TCGdex search names)
const TCGDEX_NAME_VARIATIONS: Record<string, string[]> = {
  'nidoran-f': ['nidoran♀', 'nidoran-f', 'nidoran female'],
  'nidoran-m': ['nidoran♂', 'nidoran-m', 'nidoran male'],
  'mr-mime': ['mr. mime', 'mr-mime', 'mr mime'],
  'farfetchd': ["farfetch'd", 'farfetchd', 'farfetch'],
};

// Biome definitions
const BIOMES = [
  {
    name: 'Grassland',
    description: 'Open fields with tall grass and gentle breezes',
    imageUrl: '/images/biomes/grassland.jpg'
  },
  {
    name: 'Forest',
    description: 'Dense woodland filled with towering trees',
    imageUrl: '/images/biomes/forest.jpg'
  },
  {
    name: 'Beach',
    description: 'Sandy shores where land meets the sea',
    imageUrl: '/images/biomes/beach.jpg'
  },
  {
    name: 'Sea',
    description: 'Deep ocean waters teeming with life',
    imageUrl: '/images/biomes/sea.jpg'
  },
  {
    name: 'Cave',
    description: 'Dark underground caverns filled with mystery',
    imageUrl: '/images/biomes/cave.jpg'
  },
  {
    name: 'Mountain',
    description: 'Rocky peaks reaching toward the clouds',
    imageUrl: '/images/biomes/mountain.jpg'
  },
  {
    name: 'City',
    description: 'Urban environment with buildings and bustling streets',
    imageUrl: '/images/biomes/city.jpg'
  },
  {
    name: 'Volcano',
    description: 'Scorching hot volcanic region with flowing lava',
    imageUrl: '/images/biomes/volcano.jpg'
  },
  {
    name: 'Cemetery',
    description: 'Eerie graveyard shrouded in mist',
    imageUrl: '/images/biomes/cemetery.jpg'
  }
];

// Pokemon to seed - All 151 Kanto Pokemon (Gen 1)
const POKEMON_IDS = Array.from({ length: 151 }, (_, i) => i + 1);

// Pokemon biome and time assignments - Default assignments by type
// The seed script will use Pokemon type data from PokeAPI to assign biomes intelligently
const DEFAULT_BIOME_BY_TYPE: Record<string, string[]> = {
  'Grass': ['Grassland', 'Forest'],
  'Poison': ['Forest', 'Cave'],
  'Fire': ['Volcano', 'Mountain'],
  'Water': ['Beach', 'Sea'],
  'Bug': ['Forest', 'Grassland'],
  'Normal': ['Grassland', 'City'],
  'Electric': ['City', 'Mountain'],
  'Ground': ['Cave', 'Mountain'],
  'Fairy': ['Grassland', 'Forest'],
  'Fighting': ['Mountain', 'City'],
  'Psychic': ['City', 'Cave'],
  'Rock': ['Cave', 'Mountain'],
  'Ghost': ['Cemetery', 'Cave'],
  'Ice': ['Mountain'],
  'Dragon': ['Mountain', 'Cave'],
  'Dark': ['Cemetery', 'Cave'],
  'Steel': ['Cave', 'City'],
  'Flying': ['Mountain', 'Grassland']
};

const NIGHT_TYPES = ['Ghost', 'Dark', 'Psychic']; // These spawn only at night

// Helper function to get biomes for a Pokemon based on types
function getBiomesForPokemon(type1: string, type2: string | null): { biomes: string[]; timeOfDay: string } {
  const biomes = new Set<string>();
  
  // Add biomes from type1
  const type1Biomes = DEFAULT_BIOME_BY_TYPE[type1] || ['Grassland'];
  type1Biomes.forEach(b => biomes.add(b));
  
  // Add biomes from type2 if exists
  if (type2) {
    const type2Biomes = DEFAULT_BIOME_BY_TYPE[type2] || [];
    type2Biomes.forEach(b => biomes.add(b));
  }
  
  // Determine time of day
  let timeOfDay = 'both';
  if (NIGHT_TYPES.includes(type1) || (type2 && NIGHT_TYPES.includes(type2))) {
    timeOfDay = 'night';
  } else if (type1 === 'Water' || type2 === 'Water' || type1 === 'Ground' || type2 === 'Ground') {
    timeOfDay = 'both';
  } else {
    timeOfDay = 'day';
  }
  
  return {
    biomes: Array.from(biomes).slice(0, 2), // Limit to 2 biomes per Pokemon
    timeOfDay
  };
}

async function seedBiomes() {
  console.log('Seeding biomes...');
  
  for (const biome of BIOMES) {
    await prisma.biome.upsert({
      where: { name: biome.name },
      update: biome,
      create: biome
    });
  }
  
  console.log(`✓ Seeded ${BIOMES.length} biomes`);
}

async function seedPokemon() {
  console.log('Fetching Pokemon data from PokeAPI...');
  
  const pokemonData = await fetchPokemonBatch(POKEMON_IDS, 200);
  
  console.log(`✓ Fetched ${pokemonData.length} Pokemon from PokeAPI`);
  console.log('Seeding Pokemon to database...');
  
  for (const data of pokemonData) {
    await prisma.pokemon.upsert({
      where: { name: data.name },
      update: {
        pokedexNumber: data.pokedexNumber,
        type1: data.type1,
        type2: data.type2,
        evolutionStage: data.evolutionStage,
        fullyEvolved: data.fullyEvolved,
        color: data.color,
        generation: data.generation,
        imageUrl: data.imageUrl
      },
      create: {
        name: data.name,
        pokedexNumber: data.pokedexNumber,
        type1: data.type1,
        type2: data.type2,
        evolutionStage: data.evolutionStage,
        fullyEvolved: data.fullyEvolved,
        color: data.color,
        generation: data.generation,
        imageUrl: data.imageUrl
      }
    });
  }
  
  console.log(`✓ Seeded ${pokemonData.length} Pokemon`);
  
    return pokemonData.map((p: any) => p.name);
}

async function seedPokemonSpawns(pokemonNames: string[]) {
  console.log('Seeding Pokemon spawn locations...');
  
  let spawnCount = 0;
  
  for (const pokemonName of pokemonNames) {
    const pokemon = await prisma.pokemon.findUnique({
      where: { name: pokemonName }
    });
    
    if (!pokemon) continue;
    
    // Use Pokemon's type data to determine biomes
    const spawnConfig = getBiomesForPokemon(pokemon.type1, pokemon.type2);
    
    const biomes = await prisma.biome.findMany({
      where: {
        name: { in: spawnConfig.biomes }
      }
    });
    
    for (const biome of biomes) {
      await prisma.pokemonSpawn.upsert({
        where: {
          pokemonId_biomeId_timeOfDay: {
            pokemonId: pokemon.id,
            biomeId: biome.id,
            timeOfDay: spawnConfig.timeOfDay
          }
        },
        update: {
          spawnWeight: 1.0
        },
        create: {
          pokemonId: pokemon.id,
          biomeId: biome.id,
          timeOfDay: spawnConfig.timeOfDay,
          spawnWeight: 1.0
        }
      });
      
      spawnCount++;
    }
  }
  
  console.log(`✓ Seeded ${spawnCount} Pokemon spawn locations`);
}

async function seedCards() {
  console.log('Ensuring cards for all 151 Kanto Pokémon (canonical order)...');
  
  let totalCards = 0;
  let processedPokemon = 0;
  
  for (const pokemonName of KANTO_151_NAMES) {
    try {
      const pokemon = await prisma.pokemon.findUnique({
        where: { name: pokemonName }
      });
      
      if (!pokemon) {
        console.log(`⚠ Pokemon "${pokemonName}" not found in database, skipping...`);
        continue;
      }
      
      // Try TCGdex with name variants (e.g. mr-mime -> mr. mime)
      const namesToTry = TCGDEX_NAME_VARIATIONS[pokemonName] ?? [pokemonName];
      let validCards: Awaited<ReturnType<typeof fetchProcessedCardsByPokemon>> = [];
      for (const nameVariant of namesToTry) {
        try {
          const cards = await fetchProcessedCardsByPokemon(nameVariant);
          validCards = cards.filter(card => card.imageUrl && card.imageUrl !== '');
          if (validCards.length > 0) break;
        } catch {
          continue;
        }
      }
      
      if (validCards.length > 0) {
        // Only use the first card to keep the database smaller
        const cardData = validCards[0];
        
        console.log(`  Fetched card for ${pokemonName}: ${cardData.setName}`);
        
        const normalizedRarity = normalizeRarity(cardData.rarity);
        const tiers = getAllTiersForCard(normalizedRarity);
        
        // Create card for each possible tier
        for (const tier of tiers) {
          const weight = getWeightForRarity(normalizedRarity);
          const isFloor = isFloorCard(normalizedRarity, tier);
          const isCeiling = isCeilingCard(normalizedRarity, tier);
          
          await prisma.card.upsert({
            where: {
              tcgdexId: `${cardData.tcgdexId}-t${tier}`
            },
            update: {
              pokemonName: cardData.pokemonName,
              setId: cardData.setId,
              setName: cardData.setName,
              rarity: normalizedRarity,
              tier,
              imageUrl: cardData.imageUrl,
              imageUrlLarge: cardData.imageUrlLarge,
              weight,
              isFloor,
              isCeiling
            },
            create: {
              tcgdexId: `${cardData.tcgdexId}-t${tier}`,
              pokemonId: pokemon.id,
              pokemonName: cardData.pokemonName,
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
        
        processedPokemon++;
      } else {
        // No TCGdex cards with valid images - create placeholder cards so this Pokémon appears in the Pokedex
        console.log(`  ⚠ No cards with valid images for ${pokemonName}, creating placeholder cards`);
        for (let tier = 1; tier <= 6; tier++) {
          await prisma.card.upsert({
            where: {
              tcgdexId: `placeholder-${pokemonName}-t${tier}`
            },
            update: {
              pokemonName: pokemon.name,
              imageUrl: pokemon.imageUrl ?? '',
              imageUrlLarge: pokemon.imageUrl ?? ''
            },
            create: {
              tcgdexId: `placeholder-${pokemonName}-t${tier}`,
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
        processedPokemon++;
      }
      
      // Delay to respect API rate limits
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (error) {
      console.error(`Error processing ${pokemonName}:`, error);
    }
  }
  
  console.log(`✓ Seeded ${totalCards} cards from ${processedPokemon} Pokemon`);
}

async function main() {
  console.log('Starting Pokemon Wordle TCG seed...\n');
  
  try {
    await seedBiomes();
    const pokemonNames = await seedPokemon();
    await seedPokemonSpawns(pokemonNames);
    await seedCards();
    
    console.log('\n✓ Seed completed successfully!');
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
