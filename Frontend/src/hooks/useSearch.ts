import { useQuery } from "@tanstack/react-query";
import { fetchSearchResults } from "@/lib/searchApi";

export function useSearchResults(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["search", trimmed],
    queryFn: () => fetchSearchResults(trimmed),
    enabled: trimmed.length > 0,
    staleTime: 30_000,
  });
}
