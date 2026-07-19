import { useQuery } from "@tanstack/react-query";
import { fetchItemDetail, fetchItemsList } from "@/lib/itemsApi";

export function useItemsList() {
  return useQuery({
    queryKey: ["items", "list"],
    queryFn: fetchItemsList,
    staleTime: 5 * 60_000,
  });
}

export function useItemDetail(itemId: string | undefined) {
  return useQuery({
    queryKey: ["items", itemId],
    queryFn: () => fetchItemDetail(itemId as string),
    enabled: Boolean(itemId),
  });
}
