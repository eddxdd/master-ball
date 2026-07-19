import { Shield, Swords, Users } from "lucide-react";
import { useParams } from "react-router";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ErrorState } from "@/components/ErrorState";
import { GradientCardHeader } from "@/components/GradientCardHeader";
import { LoadingState } from "@/components/LoadingState";
import { PokemonSummaryGrid } from "@/components/PokemonSummaryGrid";
import { Reveal } from "@/components/Reveal";
import { Seo } from "@/components/Seo";
import { TypeBadge } from "@/components/TypeBadge";
import { TypeMatchupChart } from "@/components/TypeMatchupChart";
import { Card, CardContent } from "@/components/ui/card";
import { useTypeDetail } from "@/hooks/usePokedex";
import type { TypeEffectiveness } from "@/types/pokemon";

const ATTACKING_GROUPS: { label: string; test: (m: number) => boolean }[] = [
  { label: "Super effective x2", test: (m) => m === 2 },
  { label: "Not very effective x0.5", test: (m) => m === 0.5 },
  { label: "No effect", test: (m) => m === 0 },
];

function AttackingChart({ matchups }: { matchups: TypeEffectiveness[] }) {
  const groups = ATTACKING_GROUPS.map((group) => ({
    ...group,
    types: matchups.filter((m) => group.test(m.multiplier)).map((m) => m.type),
  })).filter((group) => group.types.length > 0);

  if (groups.length === 0) {
    return <p className="text-muted-foreground text-sm">Neutral against every type.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => (
        <div key={group.label} className="flex items-center gap-2">
          <span className="w-40 shrink-0 text-sm text-muted-foreground">{group.label}</span>
          <div className="flex flex-wrap gap-1">
            {group.types.map((t) => (
              <TypeBadge key={t} type={t} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TypeDetail() {
  const { type } = useParams<{ type: string }>();
  const { data: typeDetail, isPending, isError } = useTypeDetail(type);

  if (isPending) {
    return <LoadingState label="Loading type" />;
  }

  if (isError || !typeDetail) {
    return (
      <>
        <Seo title="Type not found" description="This type doesn't exist." noindex />
        <ErrorState
          id="type-detail-not-found"
          status={404}
          title="Type not found"
          description="Couldn't find that type. Check the name, or browse the Pokedex instead."
          actionTo="/pokedex"
          actionLabel="Back to the Pokedex"
        />
      </>
    );
  }

  return (
    <div id="type-detail-page" className="flex flex-col gap-6">
      <Seo
        title={`${typeDetail.type} Type`}
        description={`Every ${typeDetail.type}-type Pokemon, plus its full attacking and defending type matchup chart.`}
      />
      <Breadcrumbs items={[{ label: "Types" }, { label: `${typeDetail.type} Type` }]} />

      <div id="type-detail-header" className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{typeDetail.type}</h1>
        <TypeBadge type={typeDetail.type} linkable={false} />
      </div>

      <Reveal stagger className="grid gap-4 md:grid-cols-2">
        <Card id="type-detail-attacking">
          <GradientCardHeader
            icon={Swords}
            title={`${typeDetail.type}-type moves against other types`}
          />
          <CardContent className="pt-4">
            <AttackingChart matchups={typeDetail.attacking} />
          </CardContent>
        </Card>

        <Card id="type-detail-defending">
          <GradientCardHeader
            icon={Shield}
            title={`Other types' moves against ${typeDetail.type}-type Pokemon`}
          />
          <CardContent className="pt-4">
            <TypeMatchupChart matchups={typeDetail.defending} />
          </CardContent>
        </Card>
      </Reveal>

      <Card id="type-detail-pokemon">
        <GradientCardHeader
          icon={Users}
          title={`${typeDetail.type}-type Pokemon (${typeDetail.pokemon.length})`}
        />
        <CardContent className="pt-4">
          <PokemonSummaryGrid pokemon={typeDetail.pokemon} />
        </CardContent>
      </Card>
    </div>
  );
}
