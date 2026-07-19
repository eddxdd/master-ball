import { apiFetch } from "@/lib/api";
import type { SearchResults } from "@/types/search";

export async function fetchSearchResults(query: string): Promise<SearchResults> {
  return apiFetch<SearchResults>(`/search?q=${encodeURIComponent(query)}`);
}
