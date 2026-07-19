const STORAGE_KEY = "masterball-client-id";

/**
 * Phase 3's session tracking is scoped to an anonymous, client-generated id —
 * not a real user account (see Docs/backend/README.md's "Mental-Game Coach
 * (Phase 3)" section for the rationale). Generated once per browser and
 * persisted in localStorage; there is deliberately no server-side identity
 * behind it.
 */
export function getClientId(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
