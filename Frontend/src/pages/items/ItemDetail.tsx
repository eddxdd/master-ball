import { useParams } from "react-router";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Seo } from "@/components/Seo";
import { useItemDetail } from "@/hooks/useItems";

const CATEGORY_LABELS: Record<string, string> = {
  "held-items": "Held item",
  choice: "Choice item",
  "bad-held-items": "Held item (risk/reward)",
  plates: "Arceus plate",
  "species-specific": "Species-specific item",
  "type-enhancement": "Type-enhancing item",
  "mega-stones": "Mega Stone",
  memories: "Silvally Memory",
  "in-a-pinch": "In-a-pinch berry",
  "type-protection": "Resist berry",
  "picky-healing": "Picky healing berry",
  jewels: "Gem",
};

export function ItemDetail() {
  const { itemId } = useParams<{ itemId: string }>();
  const { data: item, isPending, isError } = useItemDetail(itemId);

  if (isPending) {
    return <LoadingState label="Loading item" />;
  }

  if (isError || !item) {
    return (
      <>
        <Seo title="Item not found" description="This item doesn't exist." noindex />
        <ErrorState
          id="item-detail-not-found"
          status={404}
          title="Item not found"
          description="Couldn't find that item. It may not be in the dex, or the link is wrong."
          actionTo="/pokedex"
          actionLabel="Back to the Pokedex"
        />
      </>
    );
  }

  return (
    <div id="item-detail-page" className="flex flex-col gap-6">
      <Seo
        title={`${item.name} (Item)`}
        description={
          item.description ?? `${item.name} is a ${item.category} held item in competitive Pokemon.`
        }
      />
      <Breadcrumbs items={[{ label: "Items" }, { label: item.name }]} />

      <div id="item-detail-header" className="flex items-center gap-4">
        {item.sprite_url && (
          <img src={item.sprite_url} alt={item.name} className="h-16 w-16 object-contain" />
        )}
        <div>
          <h1 className="text-2xl font-semibold">{item.name}</h1>
          <p className="text-muted-foreground text-sm">
            {CATEGORY_LABELS[item.category] ?? item.category}
          </p>
        </div>
      </div>

      <p className="text-muted-foreground max-w-2xl">
        {item.description ?? "Description not yet catalogued."}
      </p>

      {item.fling_power != null && (
        <div
          id="item-detail-fling"
          className="w-fit rounded-lg border border-border bg-card p-3 text-center"
        >
          <div className="text-muted-foreground text-xs">Fling power</div>
          <div className="font-mono text-lg font-semibold">{item.fling_power}</div>
        </div>
      )}
    </div>
  );
}
