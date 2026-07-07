import { apiFetch } from "@/lib/api";
import type { DamageCalcRequest, DamageCalcResult } from "@/types/calculator";

export async function postDamageCalc(request: DamageCalcRequest): Promise<DamageCalcResult> {
  return apiFetch<DamageCalcResult>("/calculator/damage", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
