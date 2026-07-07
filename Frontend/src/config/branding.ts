/**
 * Single source of truth for the product's display name — see Docs/README.md's
 * "Naming & branding" section. No component should hardcode the literal name;
 * import APP_NAME from here instead, so a future rename is a one-line change.
 */
export const APP_NAME = import.meta.env.VITE_APP_NAME ?? "DexTrAIner";
