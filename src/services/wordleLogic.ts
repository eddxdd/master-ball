/**
 * Wordle Logic Service
 * Handles Pokemon attribute comparison and feedback generation
 */

import { Pokemon } from '@prisma/client';

export type FeedbackType = 'correct' | 'partial' | 'wrong' | 'n/a';

export interface GuessFeedback {
  type1: FeedbackType;
  type2: FeedbackType;
  evolutionStage: FeedbackType;
  fullyEvolved: FeedbackType;
  color: FeedbackType;
  generation: FeedbackType;
}

/**
 * Generate feedback for a guess compared to the answer
 */
export function generateFeedback(guess: Pokemon, answer: Pokemon): GuessFeedback {
  return {
    type1: compareTypes(guess.type1, guess.type2, answer.type1, answer.type2, 1),
    type2: compareTypes(guess.type1, guess.type2, answer.type1, answer.type2, 2),
    evolutionStage: compareExact(guess.evolutionStage, answer.evolutionStage),
    fullyEvolved: compareExact(guess.fullyEvolved, answer.fullyEvolved),
    color: compareExact(guess.color, answer.color),
    generation: compareExact(guess.generation, answer.generation)
  };
}

/**
 * Compare types with position awareness
 * - 'correct': type matches in the correct position
 * - 'partial': type exists but in wrong position (e.g., guessed type1=Fire but answer has type2=Fire)
 * - 'wrong': type doesn't exist in answer
 * - 'n/a': answer Pokemon doesn't have a type2 (only for position 2)
 */
function compareTypes(
  guessType1: string,
  guessType2: string | null,
  answerType1: string,
  answerType2: string | null,
  position: 1 | 2
): FeedbackType {
  const guessType = position === 1 ? guessType1 : guessType2;
  const answerType = position === 1 ? answerType1 : answerType2;
  
  // If we're checking position 2 and answer doesn't have a type2, return N/A
  // This clearly indicates to the user that the answer Pokemon is monotype
  if (position === 2 && answerType2 === null) {
    return 'n/a';
  }
  
  // If guess has no type2 but we're checking type2 position
  if (position === 2 && guessType === null) {
    return 'wrong';
  }
  
  // Exact match in position
  if (guessType === answerType) {
    return 'correct';
  }
  
  // Type exists but in wrong position
  if (position === 1) {
    // Guessed type1, check if it's actually type2
    if (guessType === answerType2) {
      return 'partial';
    }
  } else {
    // Guessed type2, check if it's actually type1
    if (guessType === answerType1) {
      return 'partial';
    }
  }
  
  // Type doesn't exist in answer
  return 'wrong';
}

/**
 * Compare exact match for non-type attributes
 */
function compareExact<T>(guessValue: T, answerValue: T): FeedbackType {
  return guessValue === answerValue ? 'correct' : 'wrong';
}

/**
 * Check if a guess wins the game.
 *
 * Primary check: exact Pokemon ID match.
 *
 * Fallback: if all six feedback attributes are identical the player has fully
 * identified the answer via the game's attribute system.  When two Pokemon share
 * every visible attribute the game has no way to distinguish them, so either
 * guess should count as a win.
 */
export function isGuessCorrect(guessPokemon: Pokemon, answerPokemon: Pokemon): boolean {
  if (guessPokemon.id === answerPokemon.id) return true;

  // Attribute-based win: all columns the player sees are definitively matched
  return (
    guessPokemon.type1 === answerPokemon.type1 &&
    guessPokemon.type2 === answerPokemon.type2 &&
    guessPokemon.evolutionStage === answerPokemon.evolutionStage &&
    guessPokemon.fullyEvolved === answerPokemon.fullyEvolved &&
    guessPokemon.color === answerPokemon.color &&
    guessPokemon.generation === answerPokemon.generation
  );
}

/**
 * Calculate tier from number of guesses used
 * Tier 1 = 1 try (best)
 * Tier 2 = 2 tries
 * Tier 3 = 3 tries
 * Tier 4 = 4 tries
 * Tier 5 = 5 tries
 * Tier 6 = 6 tries (worst)
 */
export function calculateTier(guessesUsed: number): number {
  // Clamp between 1 and 6
  return Math.max(1, Math.min(6, guessesUsed));
}

/**
 * Validate Pokemon guess
 */
export function validateGuess(guessPokemon: Pokemon | null): boolean {
  return guessPokemon !== null;
}
