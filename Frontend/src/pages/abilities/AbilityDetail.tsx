import { Sparkles } from "lucide-react";
import { useParams } from "react-router";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ErrorState } from "@/components/ErrorState";
import { GradientCardHeader } from "@/components/GradientCardHeader";
import { LoadingState } from "@/components/LoadingState";
import { PokemonSummaryGrid } from "@/components/PokemonSummaryGrid";
import { Seo } from "@/components/Seo";
import { Card, CardContent } from "@/components/ui/card";
import { useAbilityDetail } from "@/hooks/usePokedex";

export function AbilityDetail() {
  const { abilityId } = useParams<{ abilityId: string }>();
  const { data: ability, isPending, isError } = useAbilityDetail(abilityId);

  if (isPending) {
    return <LoadingState label="Loading ability" />;
  }

  if (isError || !ability) {
    return (
      <>
        <Seo title="Ability not found" description="This ability doesn't exist." noindex />
        <ErrorState
          id="ability-detail-not-found"
          status={404}
          title="Ability not found"
          description="Couldn't find that ability. It may not be in the dex, or the link is wrong."
          actionTo="/pokedex"
          actionLabel="Back to the Pokedex"
        />
      </>
    );
  }

  return (
    <div id="ability-detail-page" className="flex flex-col gap-6">
      <Seo
        title={`${ability.name} (Ability)`}
        description={
          ability.description ??
          `See every Pokemon with the ${ability.name} ability on Master Ball.`
        }
      />
      <Breadcrumbs items={[{ label: "Abilities" }, { label: ability.name }]} />

      <div id="ability-detail-header" className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{ability.name}</h1>
        <p className="text-muted-foreground">
          {ability.description ?? "Description not yet catalogued."}
        </p>
      </div>

      <Card id="ability-detail-pokemon">
        <GradientCardHeader
          icon={Sparkles}
          title={`Pokemon with this ability (${ability.pokemon.length})`}
        />
        <CardContent className="pt-4">
          <PokemonSummaryGrid pokemon={ability.pokemon} />
        </CardContent>
      </Card>
    </div>
  );
}
