export type ItemSummary = {
  id: string;
  name: string;
  category: string;
  sprite_url: string | null;
};

export type ItemDetail = ItemSummary & {
  description: string | null;
  fling_power: number | null;
};
