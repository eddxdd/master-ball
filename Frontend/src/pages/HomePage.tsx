import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { AccountCTABanner } from "@/components/AccountCTABanner";
import { FeaturedPokemonCard } from "@/components/FeaturedPokemonCard";
import { MetaDashboard } from "@/components/MetaDashboard";
import { ProfessorChat } from "@/components/ProfessorChat";
import { Reveal } from "@/components/Reveal";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/config/branding";
import { useProfessorLauncherStore } from "@/store/professorLauncherStore";

const FEATURED_POKEMON = [
  {
    speciesId: "landorustherian",
    blurb:
      "Intimidate plus U-turn make it a pivot core to countless balance and bulky offense teams.",
  },
  {
    speciesId: "greattusk",
    blurb:
      "A physically bulky Ground/Fighting-type that punishes hazard leads and slower match-ups.",
  },
  {
    speciesId: "kingambit",
    blurb:
      "Supreme Overlord scaling with each fainted ally makes it a fearsome late-game wallbreaker.",
  },
  {
    speciesId: "gholdengo",
    blurb:
      "Steel/Ghost typing plus Good as Gold makes it almost impossible to status, trap, or hazard.",
  },
  {
    speciesId: "dragapult",
    blurb: "One of the tier's fastest wallbreakers and revenge killers, viable as Scarf or Band.",
  },
  {
    speciesId: "corviknight",
    blurb:
      "A premier defensive Flying-type pivot with reliable recovery, U-turn, and hazard control.",
  },
  {
    speciesId: "toxapex",
    blurb:
      "Regenerator and Baneful Bunker make it one of the tier's best answers to setup sweepers.",
  },
  {
    speciesId: "tinglu",
    blurb: "A bulky Ground/Dark-type that reshapes hazard wars with Ruination and Whirlwind.",
  },
  {
    speciesId: "ironvaliant",
    blurb:
      "A frail but explosive mixed attacker, hitting hard from either side with Moonblast or Close Combat.",
  },
  {
    speciesId: "garganacl",
    blurb:
      "Purifying Salt and Salt Cure chip damage make it a premier, hard-to-punish physical wall.",
  },
] as const;

export function HomePage() {
  return (
    <div id="home-page" className="flex flex-col gap-16 pb-12">
      <Seo
        title="AI-Powered Competitive Pokemon Companion"
        description="A fast, accurate Pokedex, damage calculator, and team builder for competitive Pokemon, with the Professor layered on top. Free, no account needed."
      />

      {/* Hero + Professor sit closer together as the opening composition */}
      <div className="flex flex-col gap-6">
        {/* Hero */}
        <section
          id="home-hero"
          className="relative overflow-hidden rounded-3xl border border-border bg-cover bg-center px-6 py-16 text-center sm:px-12 sm:py-24"
          style={{
            background:
              "linear-gradient(rgb(0 0 0 / 0.38), rgb(0 0 0 / 0.38)), url('/images/image1.jpg') center / cover no-repeat",
          }}
        >
          <div
            className="relative flex flex-col items-center gap-5"
            style={{ textShadow: "0 2px 18px rgb(0 0 0 / 0.95)" }}
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-300/40 bg-black/55 px-3 py-1 text-xs font-medium text-yellow-100 shadow-lg shadow-black/30">
              <Sparkles className="size-3.5 text-yellow-300" />
              Gen 9 OU · real data + the Professor
            </span>
            <h1 className="text-4xl font-bold text-[#f8d030] drop-shadow-[0_3px_12px_rgb(0_0_0_/_0.95)] sm:text-6xl">
              {APP_NAME}
            </h1>
            <p className="max-w-2xl text-balance font-medium text-white sm:text-lg">
              Browse a full competitive Pokedex, build and analyze teams, run damage calcs, and ask
              the Professor — an AI assistant grounded in real data — to sharpen your knowledge and
              win more Pokemon battles.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Button
                render={<Link to="/pokedex" />}
                variant="default"
                size="lg"
                className="!border-[#222222] !bg-[#f8d030] text-[#111111] shadow-lg shadow-black/35 hover:!border-[#111111] hover:!bg-[#ffe066] hover:text-[#111111]"
              >
                Browse the Pokedex <ArrowRight />
              </Button>
              <Button
                render={<Link to="/team-builder" />}
                variant="default"
                size="lg"
                className="!border-[#222222] !bg-[#111111] text-[#f8d030] shadow-lg shadow-black/35 hover:!border-[#f8d030] hover:!bg-[#222222] hover:text-[#ffe066]"
              >
                Build a Team
              </Button>
            </div>
          </div>
        </section>

        {/* Professor showcase embed on the homepage; day-to-day chat lives behind the Rotom launcher. */}
        <section
          id="home-professor"
          className="w-full overflow-hidden rounded-2xl border border-border bg-card"
        >
          <div className="relative flex items-center gap-3 overflow-hidden border-b border-border/70 px-4 py-3.5 sm:px-5">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[image:var(--gradient-brand)] opacity-[0.12]"
            />
            <img
              src="/images/professor-avatar.png"
              alt=""
              aria-hidden
              className="relative size-10 shrink-0 rounded-full object-cover shadow-sm ring-1 ring-border"
            />
            <div className="relative min-w-0 flex-1">
              <h2 className="text-base font-semibold leading-tight">Professor</h2>
              <p className="truncate text-sm text-muted-foreground">
                Matchups, sets, strategy — grounded answers, not guesses.
              </p>
            </div>
            <button
              type="button"
              className="link-underline relative shrink-0 cursor-pointer text-xs font-medium text-white hover:text-white/80"
              onClick={() => useProfessorLauncherStore.getState().openChat()}
            >
              Open Rotom chat
            </button>
          </div>
          <ProfessorChat compact />
        </section>
      </div>

      {/* Featured Pokemon / strategy notes */}
      <section id="home-featured-pokemon" className="flex flex-col gap-6">
        <Reveal>
          <div>
            <h2 className="text-xl font-semibold">Featured OU Pokemon</h2>
            <p className="text-sm text-muted-foreground">
              Ten staples of the current meta — open any card for full stats, movepools, abilities,
              and more in the Pokedex.
            </p>
          </div>
        </Reveal>
        <Reveal stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {FEATURED_POKEMON.map((p) => (
            <FeaturedPokemonCard key={p.speciesId} {...p} />
          ))}
        </Reveal>
      </section>

      <AccountCTABanner />

      <MetaDashboard showAnalyticsLink />
    </div>
  );
}
