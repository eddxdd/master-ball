import { useQueries } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { PokemonShowcaseCard } from "@/components/PokemonShowcaseCard";
import { Button } from "@/components/ui/button";
import { fetchPokemonProfile } from "@/lib/pokedexApi";
import { cn } from "@/lib/utils";
import type { PokemonProfile } from "@/types/pokemon";

const ROTATE_MS = 5000;

type ShowcaseEntry = {
  /** Tried in order until a profile resolves (formes may be missing). */
  speciesIds: string[];
  fallbackName: string;
  item: string;
  ability: string;
  moves: string[];
};

const SHOWCASE: ShowcaseEntry[] = [
  {
    speciesIds: ["kyogreprimal", "kyogre"],
    fallbackName: "Primal Kyogre",
    item: "Blue Orb",
    ability: "Primordial Sea",
    moves: ["Origin Pulse", "Ice Beam", "Thunder", "Water Spout"],
  },
  {
    speciesIds: ["mew"],
    fallbackName: "Mew",
    item: "Leftovers",
    ability: "Synchronize",
    moves: ["Psychic", "Aura Sphere", "Soft-Boiled", "Stealth Rock"],
  },
  {
    speciesIds: ["ludicolo"],
    fallbackName: "Ludicolo",
    item: "Life Orb",
    ability: "Swift Swim",
    moves: ["Hydro Pump", "Giga Drain", "Ice Beam", "Rain Dance"],
  },
  {
    speciesIds: ["charizard"],
    fallbackName: "Charizard",
    item: "Heavy-Duty Boots",
    ability: "Blaze",
    moves: ["Roost", "Hurricane", "Fire Blast", "Toxic"],
  },
  {
    speciesIds: ["gyarados"],
    fallbackName: "Gyarados",
    item: "Leftovers",
    ability: "Intimidate",
    moves: ["Waterfall", "Earthquake", "Ice Fang", "Dragon Dance"],
  },
  {
    speciesIds: ["banettemega", "banette"],
    fallbackName: "Mega Banette",
    item: "Banettite",
    ability: "Prankster",
    moves: ["Will-O-Wisp", "Destiny Bond", "Shadow Sneak", "Sucker Punch"],
  },
];

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function resolveProfile(
  entry: ShowcaseEntry,
  byId: Map<string, PokemonProfile | undefined>,
): PokemonProfile | undefined {
  for (const id of entry.speciesIds) {
    const profile = byId.get(id);
    if (profile) return profile;
  }
  return undefined;
}

/**
 * Pokedex-top CTA into Team Builder — rotating showcase cards in the same
 * sprite-forward language as roster slots.
 */
export function PokedexTeamBuilderPromo() {
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [swapKey, setSwapKey] = useState(0);

  const speciesIds = [...new Set(SHOWCASE.flatMap((entry) => entry.speciesIds))];
  const profileQueries = useQueries({
    queries: speciesIds.map((id) => ({
      queryKey: ["pokedex", "profile", id] as const,
      queryFn: () => fetchPokemonProfile(id),
      staleTime: 10 * 60_000,
      retry: false as const,
    })),
  });

  const profilesById = new Map<string, PokemonProfile | undefined>();
  speciesIds.forEach((id, i) => {
    profilesById.set(id, profileQueries[i]?.data);
  });

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % SHOWCASE.length);
      setSwapKey((key) => key + 1);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  const entry = SHOWCASE[index] ?? SHOWCASE[0];
  const profile = resolveProfile(entry, profilesById);
  const speciesId = profile?.id ?? entry.speciesIds[0];

  return (
    <section
      id="pokedex-team-builder-promo"
      className="flex flex-col gap-3 rounded-3xl border border-border/80 bg-card/40 p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">Team Builder</p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight sm:text-xl">
            Need help building a team?
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Visit our Team Building section — pick species, items, and moves visually, then get
            coverage and insights in one place.
          </p>
        </div>
        <Button
          render={<Link to="/team-builder" />}
          variant="gradient"
          size="sm"
          className="shrink-0 self-start sm:self-auto"
        >
          Open Team Builder
          <ArrowRight />
        </Button>
      </div>

      <PokemonShowcaseCard
        speciesId={speciesId}
        to="/team-builder"
        ariaLabel={`Example set: ${profile?.name ?? entry.fallbackName}. Open Team Builder.`}
        fallbackName={entry.fallbackName}
        ability={entry.ability}
        moves={entry.moves}
        itemName={entry.item}
        swapKey={swapKey}
      >
        {!reducedMotion && (
          <span
            key={`bar-${swapKey}`}
            aria-hidden
            className="team-promo-progress pointer-events-none absolute inset-x-0 bottom-0 h-1 origin-left bg-white/35"
            style={{ animationDuration: `${ROTATE_MS}ms` }}
          />
        )}
      </PokemonShowcaseCard>

      <div
        className="flex items-center justify-center gap-1.5"
        role="tablist"
        aria-label="Showcase sets"
      >
        {SHOWCASE.map((slot, i) => (
          <button
            key={slot.fallbackName}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Show ${slot.fallbackName}`}
            className={cn(
              "h-1.5 rounded-full transition-[width,background-color] duration-300",
              i === index
                ? "w-5 bg-primary"
                : "w-1.5 bg-muted-foreground/35 hover:bg-muted-foreground/55",
            )}
            onClick={() => {
              setIndex(i);
              setSwapKey((key) => key + 1);
            }}
          />
        ))}
      </div>
    </section>
  );
}
