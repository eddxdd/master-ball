-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "appliedPityTier" INTEGER;

-- AlterTable
ALTER TABLE "PityTracker" ADD COLUMN     "consecutiveTier3" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "consecutiveTier4" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "Guess" ADD CONSTRAINT "Guess_pokemonId_fkey" FOREIGN KEY ("pokemonId") REFERENCES "Pokemon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
