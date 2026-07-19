export type SearchResultItem = {
  id: string;
  name: string;
  subtitle: string | null;
  sprite_url: string | null;
};

export type SearchResults = {
  pokemon: SearchResultItem[];
  moves: SearchResultItem[];
  abilities: SearchResultItem[];
  items: SearchResultItem[];
  types: SearchResultItem[];
};
