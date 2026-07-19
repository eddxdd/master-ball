import {
  ArrowLeft,
  BarChart3,
  Check,
  GitBranch,
  ListOrdered,
  Shield,
  SlidersHorizontal,
  Sparkles,
  UserPlus,
  Wand2,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ErrorState } from "@/components/ErrorState";
import { GradientCardHeader } from "@/components/GradientCardHeader";
import { InfoLink } from "@/components/InfoLink";
import { LoadingState } from "@/components/LoadingState";
import { MovepoolTable } from "@/components/MovepoolTable";
import { PokeballWatermark } from "@/components/PokeballWatermark";
import { PokemonSprite } from "@/components/PokemonSprite";
import { Reveal } from "@/components/Reveal";
import { Seo } from "@/components/Seo";
import { StatBars } from "@/components/StatBars";
import { TypeMatchupChart } from "@/components/TypeMatchupChart";
import { UsageStatsCard } from "@/components/UsageStatsCard";
import { Card, CardContent } from "@/components/ui/card";
import { usePokemonProfile } from "@/hooks/usePokedex";
import { typeColor, typeTextColor } from "@/lib/typeColors";
import { cn } from "@/lib/utils";
import { useProfessorLauncherStore } from "@/store/professorLauncherStore";
import { useTeamStore } from "@/store/teamStore";
import type { PokemonProfile, SpecialFormeRef } from "@/types/pokemon";

function profileDescription(profile: PokemonProfile): string {
  const types = [profile.type1, profile.type2].filter(Boolean).join("/");
  const total = Object.values(profile.base_stats).reduce((sum, v) => sum + v, 0);
  return `${profile.name} (#${profile.num}) is a ${types}-type Pokemon with ${total} total base stats. View its full movepool, abilities, type matchups, and evolution line on Master Ball.`;
}

/** The evolution line plus, joining the same flex-wrap row rather than a
 * separate block below, every Mega Evolution/Gigantamax forme found anywhere
 * in that line — e.g. viewing Charmander still surfaces Charizard's Mega X,
 * Mega Y, and Gmax. Being part of the same wrapping row means it fills the
 * empty space to the right of a short evolution line (e.g. Venusaur, done
 * evolving) instead of always dropping to its own row underneath; a vertical
 * divider plus its own label still keeps the two ideas ("this is what it
 * evolves into" vs. "this is a temporary in-battle transformation") visually
 * distinct when they do end up side by side. Every sprite — evolution stages
 * and alternate formes alike — uses the same `PokemonSprite` size
 * throughout, no smaller "side note" thumbnails. */
function hasEvolutionOrFormes(profile: PokemonProfile): boolean {
  const stages = profile.evolution_chain;
  const isSingleUnevolvedStage = stages.length <= 1 && (stages[0]?.pokemon.length ?? 0) <= 1;
  const formes = stages.flatMap((stage) => stage.pokemon.flatMap((node) => node.special_formes));
  return !(isSingleUnevolvedStage && formes.length === 0);
}

function EvolutionChain({
  profile,
  layout = "row",
}: {
  profile: PokemonProfile;
  /** `column` = mobile sheet: one sprite per row, centered, with the
   * evolution condition between stages. `row` = desktop horizontal chain. */
  layout?: "row" | "column";
}) {
  const stages = profile.evolution_chain;
  const isSingleUnevolvedStage = stages.length <= 1 && (stages[0]?.pokemon.length ?? 0) <= 1;
  const formes = stages.flatMap((stage) => stage.pokemon.flatMap((node) => node.special_formes));

  if (!hasEvolutionOrFormes(profile)) {
    return null;
  }

  const chain =
    layout === "column" ? (
      <div className="flex flex-col items-center gap-3">
        {!isSingleUnevolvedStage &&
          stages.map((stage, stageIndex) =>
            stage.pokemon.map((node) => (
              <div key={node.id} className="flex flex-col items-center gap-2">
                {stageIndex > 0 && <EvolutionArrow condition={node.condition} direction="down" />}
                <EvolutionNode
                  id={node.id}
                  name={node.name}
                  spriteUrl={node.sprite_url}
                  current={node.id === profile.id}
                />
              </div>
            )),
          )}

        {formes.length > 0 && (
          <div className="mt-2 flex w-full flex-col items-center gap-3 border-t border-border pt-4">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium uppercase tracking-wide">
              <Wand2 className="size-3.5" />
              Mega Evolution &amp; Gigantamax
            </div>
            {formes.map((forme) => (
              <AlternateFormNode key={forme.id} forme={forme} current={forme.id === profile.id} />
            ))}
          </div>
        )}
      </div>
    ) : (
      <div className="flex flex-wrap items-start gap-4">
        {!isSingleUnevolvedStage &&
          stages.map((stage, stageIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: stages are positional depth levels, not a reorderable list
            <div key={stageIndex} className="flex flex-col gap-3">
              {stage.pokemon.map((node) => (
                <div key={node.id} className="flex items-center gap-3">
                  {stageIndex > 0 && <EvolutionArrow condition={node.condition} />}
                  <EvolutionNode
                    id={node.id}
                    name={node.name}
                    spriteUrl={node.sprite_url}
                    current={node.id === profile.id}
                  />
                </div>
              ))}
            </div>
          ))}

        {formes.length > 0 && (
          <div className="flex items-start gap-4">
            {!isSingleUnevolvedStage && <div className="mt-1 h-24 w-px bg-border" />}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium uppercase tracking-wide">
                <Wand2 className="size-3.5" />
                Mega Evolution &amp; Gigantamax
              </div>
              <div className="flex flex-wrap gap-4">
                {formes.map((forme) => (
                  <AlternateFormNode
                    key={forme.id}
                    forme={forme}
                    current={forme.id === profile.id}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );

  // Mobile sheet already has tabs/section chrome — skip the card banner so
  // the vertical chain can breathe. Desktop keeps the existing card.
  if (layout === "column") {
    return chain;
  }

  return (
    <Card>
      <GradientCardHeader icon={GitBranch} title="Evolution" />
      <CardContent className="pt-4">{chain}</CardContent>
    </Card>
  );
}

function EvolutionNode({
  id,
  name,
  spriteUrl,
  current = false,
}: {
  id: string;
  name: string;
  spriteUrl: string;
  current?: boolean;
}) {
  const content = (
    <div className="flex flex-col items-center gap-1">
      <PokemonSprite spriteUrl={spriteUrl} name={name} />
      <span className="text-sm font-medium">{name}</span>
    </div>
  );

  if (current) {
    return <div className="rounded-lg border border-primary/50 bg-muted/50 p-2">{content}</div>;
  }

  return (
    <Link
      to={`/pokedex/${id}`}
      className="rounded-lg border border-transparent p-2 transition-colors hover:border-border hover:bg-muted"
    >
      {content}
    </Link>
  );
}

/** Same clickable-node treatment (and same `PokemonSprite` size) as
 * `EvolutionNode` — the forme tag (e.g. "Gmax", "Mega-X") is shown as a
 * small badge under the name since `AlternateFormsCard` mixes formes from
 * multiple species. */
function AlternateFormNode({ forme, current }: { forme: SpecialFormeRef; current: boolean }) {
  const content = (
    <div className="flex flex-col items-center gap-1">
      <PokemonSprite spriteUrl={forme.sprite_url} name={forme.name} />
      <span className="text-sm font-medium">{forme.name}</span>
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        {forme.forme}
      </span>
    </div>
  );

  if (current) {
    return <div className="rounded-lg border border-primary/50 bg-muted/50 p-2">{content}</div>;
  }

  return (
    <Link
      to={`/pokedex/${forme.id}`}
      className="rounded-lg border border-transparent p-2 transition-colors hover:border-border hover:bg-muted"
    >
      {content}
    </Link>
  );
}

function EvolutionArrow({
  condition,
  direction = "right",
}: {
  condition: string | null;
  direction?: "right" | "down";
}) {
  // Vertical (mobile): grey "Lvl 16"-style bubble between sprites.
  if (direction === "down") {
    return (
      <span className="rounded-full bg-muted px-3 py-1 text-center text-muted-foreground text-xs font-medium">
        {condition ?? "Evolves into"}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center gap-0.5 text-muted-foreground">
      <span aria-hidden>→</span>
      {condition && <span className="text-xs whitespace-nowrap">{condition}</span>}
    </div>
  );
}

/** The ability name/description list shared by the desktop "Abilities" card
 * and the mobile "About" tab, so both stay in sync with a single source. */
function AbilitiesList({ abilities }: { abilities: PokemonProfile["abilities"] }) {
  return (
    <dl className="flex flex-col gap-2">
      {abilities.map((ability) => (
        <div key={ability.id}>
          <dt className="font-medium">
            <InfoLink to={`/abilities/${ability.id}`} title={ability.description}>
              {ability.name}
            </InfoLink>
          </dt>
          <dd className="text-muted-foreground text-sm">
            {ability.description ?? "Description not yet catalogued."}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The nature +/- cheat sheet shared by the desktop "Natures reference" card
 * and the mobile "Base Stats" tab (see `AbilitiesList` above). */
function NaturesReference({ natures }: { natures: PokemonProfile["natures"] }) {
  return (
    <div className="grid max-h-56 grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto text-sm">
      {natures.map((nature) => (
        <div key={nature.id} className="flex justify-between gap-2">
          <span>{nature.name}</span>
          <span className="text-muted-foreground">
            {nature.increased_stat
              ? `+${nature.increased_stat} / -${nature.decreased_stat}`
              : "neutral"}
          </span>
        </div>
      ))}
    </div>
  );
}

function ProfileSections({ profile, id }: { profile: PokemonProfile; id?: string }) {
  return (
    <Reveal id={id} stagger className="grid gap-4 md:grid-cols-2">
      <Card>
        <GradientCardHeader icon={BarChart3} title="Base stats" />
        <CardContent className="pt-4">
          <StatBars
            stats={profile.base_stats}
            minStats={profile.min_stats}
            maxStats={profile.max_stats}
          />
        </CardContent>
      </Card>

      <Card>
        <GradientCardHeader icon={Shield} title="Type matchups" />
        <CardContent className="pt-4">
          <TypeMatchupChart matchups={profile.type_matchups} />
        </CardContent>
      </Card>

      <Card>
        <GradientCardHeader icon={Sparkles} title="Abilities" />
        <CardContent className="pt-4">
          <AbilitiesList abilities={profile.abilities} />
        </CardContent>
      </Card>

      <Card>
        <GradientCardHeader icon={SlidersHorizontal} title="Natures reference" />
        <CardContent className="pt-4">
          <NaturesReference natures={profile.natures} />
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <GradientCardHeader
          icon={ListOrdered}
          title={`Movepool (${profile.learnable_moves.length})`}
        />
        <CardContent className="pt-4">
          <MovepoolTable moves={profile.learnable_moves} />
        </CardContent>
      </Card>
    </Reveal>
  );
}

/** Soft dark halo so white hero copy stays readable on light types
 * (Grass, Electric, Ice, Fairy) without muddying darker ones. */
const HERO_TEXT_SHADOW = "0 1px 2px rgb(0 0 0 / 0.55), 0 2px 14px rgb(0 0 0 / 0.4)";

/** Real type-colored pills on the hero (same palette as `TypeBadge`).
 * Soft white rim + drop shadow instead of a black ring — reads cleanly on
 * every type-colored hero without the muddy edge against Water/Fire/etc. */
function HeroTypePill({ type }: { type: string }) {
  return (
    <Link
      to={`/types/${type}`}
      className="rounded-full px-3 py-0.5 text-xs font-semibold tracking-wide uppercase shadow-[0_1px_2px_rgb(0_0_0_/0.28),0_4px_10px_rgb(0_0_0_/0.18)] ring-1 ring-white/35 transition-opacity hover:opacity-90"
      style={{ backgroundColor: typeColor(type), color: typeTextColor(type) }}
    >
      {type}
    </Link>
  );
}

function MobileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Reveal>
      <section className="flex flex-col gap-2.5">
        <h2 className="text-xs font-bold tracking-widest text-foreground/80 uppercase">{title}</h2>
        {children}
      </section>
    </Reveal>
  );
}

function professorAskFor(profile: PokemonProfile): string {
  return `What's a good competitive set and role for ${profile.name} in Gen 9 OU? Cover common items, moves, and what it checks.`;
}

/**
 * Round Professor avatar (opens Rotom chat + auto-asks) + round Add-to-team —
 * sits after the hero sprite and before the evolution section on both layouts.
 */
function PokemonDetailActions({ profile }: { profile: PokemonProfile }) {
  const navigate = useNavigate();
  const openChat = useProfessorLauncherStore((s) => s.openChat);
  const addMemberWithSpecies = useTeamStore((s) => s.addMemberWithSpecies);
  const teamSize = useTeamStore((s) => s.team.members.length);
  const [justAdded, setJustAdded] = useState(false);

  const teamFull = teamSize >= 6;

  useEffect(() => {
    if (!justAdded) return;
    const id = window.setTimeout(() => setJustAdded(false), 2000);
    return () => window.clearTimeout(id);
  }, [justAdded]);

  const onAskProfessor = () => {
    openChat(professorAskFor(profile));
  };

  const onAddToTeam = () => {
    if (teamFull) {
      navigate("/team-builder");
      return;
    }
    addMemberWithSpecies(profile.id);
    setJustAdded(true);
  };

  return (
    <div id="pokemon-detail-actions" className="flex items-start justify-center gap-8">
      <button
        type="button"
        onClick={onAskProfessor}
        className="group flex w-20 cursor-pointer flex-col items-center gap-1.5 text-center"
      >
        <span className="relative size-16 overflow-hidden rounded-full shadow-md ring-2 ring-border transition group-hover:ring-primary group-focus-visible:ring-primary">
          <img src="/images/professor-avatar.png" alt="" className="size-full object-cover" />
        </span>
        <span className="text-xs font-medium leading-tight text-foreground group-hover:text-primary">
          Ask Professor
        </span>
      </button>

      <button
        type="button"
        onClick={onAddToTeam}
        className="group flex w-20 cursor-pointer flex-col items-center gap-1.5 text-center"
      >
        <span
          className={cn(
            "flex size-16 items-center justify-center rounded-full border-2 border-border bg-card shadow-md transition",
            "group-hover:border-primary group-hover:bg-primary/10 group-focus-visible:border-primary",
            justAdded && "border-primary bg-primary/10 text-primary",
          )}
        >
          {justAdded ? <Check className="size-6" /> : <UserPlus className="size-6" />}
        </span>
        <span className="text-xs font-medium leading-tight text-foreground group-hover:text-primary">
          {teamFull ? "Team full" : justAdded ? "Added" : "Add to team"}
        </span>
      </button>
    </div>
  );
}

/** Ability chips use Steel's type gray with black label text. */
function MobileAbilityPills({ abilities }: { abilities: PokemonProfile["abilities"] }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {abilities.map((ability) => (
        <span
          key={ability.id}
          className="inline-flex items-center rounded-full px-4 py-1.5 shadow-sm ring-1 ring-black/10"
          style={{ backgroundColor: typeColor("Steel") }}
        >
          <InfoLink
            to={`/abilities/${ability.id}`}
            title={ability.description}
            className="text-sm font-medium text-black no-underline decoration-transparent"
          >
            {ability.name}
          </InfoLink>
        </span>
      ))}
    </div>
  );
}

/** Mobile sheet: type-color + Pokeball hero, then a single-scroll sheet.
 * Weaknesses/stats reuse the desktop `TypeMatchupChart` / `StatBars`.
 * Desktop uses the same hero treatment, then stacked cards (`hidden md:flex`). */
function MobilePokemonDetail({
  profile,
  onHeroReady,
}: {
  profile: PokemonProfile;
  onHeroReady?: () => void;
}) {
  return (
    <div className="-mx-4 -mt-6 flex flex-col md:hidden">
      <div
        className="relative px-4 pt-4 pb-2"
        style={{ backgroundColor: typeColor(profile.type1) }}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <PokeballWatermark />
        </div>

        <Link
          to="/pokedex"
          className="relative z-10 inline-flex items-center gap-1 text-sm font-medium text-white/90"
          style={{ textShadow: HERO_TEXT_SHADOW }}
        >
          <ArrowLeft className="size-4" />
          Pokedex
        </Link>

        <div
          className="relative z-10 mt-3 flex flex-col items-center gap-1 text-center text-white"
          style={{ textShadow: HERO_TEXT_SHADOW }}
        >
          <p className="text-sm font-medium text-white/85">#{profile.num}</p>
          <h1 className="text-3xl font-bold tracking-tight">{profile.name}</h1>
          {profile.genus && <p className="text-sm font-medium text-white/90">{profile.genus}</p>}
          <div className="mt-1.5 flex gap-1.5" style={{ textShadow: "none" }}>
            <HeroTypePill type={profile.type1} />
            {profile.type2 && <HeroTypePill type={profile.type2} />}
          </div>
        </div>

        <div className="relative z-20 -mb-16 flex justify-center pt-5">
          <PokemonSprite
            spriteUrl={profile.sprite_url}
            name={profile.name}
            priority
            artworkNum={profile.forme ? undefined : profile.num}
            preferHome
            onReady={onHeroReady}
            className="h-44 w-44 drop-shadow-2xl"
          />
        </div>
      </div>

      <div className="relative z-10 flex flex-col gap-6 rounded-t-3xl bg-card px-5 pt-20 pb-8 shadow-sm ring-1 ring-foreground/10">
        {profile.description && (
          <MobileSection title="Pokedex entry">
            <p className="text-center text-sm leading-relaxed text-foreground/90">
              {profile.description}
            </p>
          </MobileSection>
        )}

        <MobileSection title="Abilities">
          <MobileAbilityPills abilities={profile.abilities} />
        </MobileSection>

        <MobileSection title="Weaknesses">
          <TypeMatchupChart matchups={profile.type_matchups} />
        </MobileSection>

        <MobileSection title="Stats">
          <StatBars
            stats={profile.base_stats}
            minStats={profile.min_stats}
            maxStats={profile.max_stats}
          />
        </MobileSection>

        <PokemonDetailActions profile={profile} />

        <MobileSection title="Evolution">
          {hasEvolutionOrFormes(profile) ? (
            <EvolutionChain profile={profile} layout="column" />
          ) : (
            <p className="text-center text-muted-foreground text-sm">
              {profile.name} does not evolve.
            </p>
          )}
        </MobileSection>

        <MobileSection title={`Movepool (${profile.learnable_moves.length})`}>
          <MovepoolTable moves={profile.learnable_moves} />
        </MobileSection>

        <Reveal>
          <UsageStatsCard speciesId={profile.id} />
        </Reveal>
      </div>
    </div>
  );
}

export function PokemonDetail() {
  const { speciesId } = useParams<{ speciesId: string }>();
  const { data: profile, isPending, isError } = usePokemonProfile(speciesId);
  // Hold the whole page at opacity 0 until the hero sprite is ready, then
  // fade *everything* in together — no more “UI first, sprite snaps later”.
  const [revealed, setRevealed] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: must reset whenever the route species changes
  useEffect(() => {
    setRevealed(false);
  }, [speciesId]);

  const onHeroReady = useCallback(() => setRevealed(true), []);

  // Don't leave the page invisible forever if the sprite chain stalls.
  useEffect(() => {
    if (!profile || revealed) return;
    const timeout = window.setTimeout(() => setRevealed(true), 2500);
    return () => window.clearTimeout(timeout);
  }, [profile, revealed]);

  if (isPending) {
    return <LoadingState label="Loading Pokemon" />;
  }

  if (isError || !profile) {
    return (
      <>
        <Seo title="Pokemon not found" description="This Pokemon doesn't exist." noindex />
        <ErrorState
          id="pokemon-detail-not-found"
          status={404}
          title="Pokemon not found"
          description="Couldn't find that Pokemon in the dex. Check the spelling, or browse for another."
          actionTo="/pokedex"
          actionLabel="Back to the Pokedex"
        />
      </>
    );
  }

  return (
    <div className="relative">
      {!revealed && <LoadingState label="Loading Pokemon" />}
      <div
        key={profile.id}
        id="pokemon-detail-page"
        aria-hidden={!revealed}
        className={cn(
          "flex flex-col gap-6 transition-opacity duration-500 ease-out",
          revealed ? "opacity-100" : "pointer-events-none absolute inset-x-0 top-0 opacity-0",
        )}
      >
        <Seo title={profile.name} description={profileDescription(profile)} />

        <div className="hidden md:flex md:flex-col md:gap-6">
          <Breadcrumbs items={[{ label: "Pokedex", to: "/pokedex" }, { label: profile.name }]} />

          {/* Type-color hero — same treatment as the mobile sheet header.
           * Overflow stays on the watermark layer only so the sprite can hang
           * below the band without getting clipped. */}
          <div
            id="pokemon-detail-header"
            className="relative rounded-3xl px-8 pt-8"
            style={{ backgroundColor: typeColor(profile.type1) }}
          >
            <div
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
              aria-hidden
            >
              <PokeballWatermark className="-top-16 -right-16 h-[22rem] w-[22rem] text-white/25" />
            </div>

            <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:gap-10">
              <div className="relative z-20 -mb-16 shrink-0 self-center lg:self-end">
                <PokemonSprite
                  spriteUrl={profile.sprite_url}
                  name={profile.name}
                  priority
                  artworkNum={profile.forme ? undefined : profile.num}
                  preferHome
                  onReady={onHeroReady}
                  className="h-56 w-56 drop-shadow-2xl"
                />
              </div>

              <div
                className="min-w-0 flex-1 pb-14 text-center text-white lg:pb-12 lg:text-left"
                style={{ textShadow: HERO_TEXT_SHADOW }}
              >
                <p className="text-sm font-medium text-white/85">#{profile.num}</p>
                <h1 className="text-4xl font-bold tracking-tight">{profile.name}</h1>
                {profile.genus && (
                  <p className="mt-1 text-base font-medium text-white/90">{profile.genus}</p>
                )}
                <div
                  className="mt-3 flex flex-wrap justify-center gap-1.5 lg:justify-start"
                  style={{ textShadow: "none" }}
                >
                  <HeroTypePill type={profile.type1} />
                  {profile.type2 && <HeroTypePill type={profile.type2} />}
                </div>
              </div>

              {profile.description && (
                <p
                  className="max-w-md pb-14 text-center text-sm leading-relaxed text-white/95 italic lg:ml-auto lg:pb-12 lg:text-left"
                  style={{ textShadow: HERO_TEXT_SHADOW }}
                >
                  {profile.description}
                </p>
              )}
            </div>
          </div>

          <div className="relative z-10 flex flex-col gap-6 pt-12">
            <Reveal>
              <PokemonDetailActions profile={profile} />
            </Reveal>

            <Reveal id="pokemon-detail-evolution">
              <EvolutionChain profile={profile} />
            </Reveal>

            <ProfileSections profile={profile} id="pokemon-detail-profile" />

            <Reveal id="pokemon-detail-usage-stats">
              <UsageStatsCard speciesId={profile.id} />
            </Reveal>
          </div>
        </div>

        <MobilePokemonDetail profile={profile} onHeroReady={onHeroReady} />
      </div>
    </div>
  );
}
