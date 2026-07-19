import { Swords } from "lucide-react";
import { useParams } from "react-router";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ErrorState } from "@/components/ErrorState";
import { GradientCardHeader } from "@/components/GradientCardHeader";
import { LoadingState } from "@/components/LoadingState";
import { MoveCategoryBadge } from "@/components/MoveCategoryBadge";
import { PokemonSummaryGrid } from "@/components/PokemonSummaryGrid";
import { Reveal } from "@/components/Reveal";
import { Seo } from "@/components/Seo";
import { TypeBadge } from "@/components/TypeBadge";
import { Card, CardContent } from "@/components/ui/card";
import { useMoveDetail } from "@/hooks/usePokedex";

export function MoveDetail() {
  const { moveId } = useParams<{ moveId: string }>();
  const { data: move, isPending, isError } = useMoveDetail(moveId);

  if (isPending) {
    return <LoadingState label="Loading move" />;
  }

  if (isError || !move) {
    return (
      <>
        <Seo title="Move not found" description="This move doesn't exist." noindex />
        <ErrorState
          id="move-detail-not-found"
          status={404}
          title="Move not found"
          description="Couldn't find that move. It may not be in the dex, or the link is wrong."
          actionTo="/pokedex"
          actionLabel="Back to the Pokedex"
        />
      </>
    );
  }

  return (
    <div id="move-detail-page" className="flex flex-col gap-6">
      <Seo
        title={`${move.name} (Move)`}
        description={
          move.description ??
          `${move.name} is a ${move.category} ${move.type}-type move. See which Pokemon can learn it on Master Ball.`
        }
      />
      <Breadcrumbs items={[{ label: "Moves" }, { label: move.name }]} />

      <div id="move-detail-header" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{move.name}</h1>
          <TypeBadge type={move.type} />
          <MoveCategoryBadge category={move.category} />
        </div>
        {move.description && <p className="text-muted-foreground">{move.description}</p>}
      </div>

      <Reveal id="move-detail-stats" stagger className="grid grid-cols-3 gap-3 sm:max-w-md">
        <Stat label="Power" value={move.base_power ?? "—"} />
        <Stat label="Accuracy" value={move.accuracy ?? "—"} />
        <Stat label="PP" value={move.pp} />
      </Reveal>

      <Card id="move-detail-pokemon">
        <GradientCardHeader icon={Swords} title={`Learned by (${move.learned_by.length})`} />
        <CardContent className="pt-4">
          <PokemonSummaryGrid pokemon={move.learned_by} />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-mono text-lg font-semibold">{value}</div>
    </div>
  );
}
