import { apiFetch } from "@/lib/api";
import type { ItemDetail, ItemSummary } from "@/types/items";

export async function fetchItemsList(): Promise<ItemSummary[]> {
  return apiFetch<ItemSummary[]>("/items");
}

export async function fetchItemDetail(itemId: string): Promise<ItemDetail> {
  return apiFetch<ItemDetail>(`/items/${itemId}`);
}
