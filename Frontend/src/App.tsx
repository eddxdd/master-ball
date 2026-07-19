import { lazy, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { AppLayout } from "@/layout/AppLayout";
import { HomePage } from "@/pages/HomePage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { useThemeStore } from "@/store/themeStore";

/** Route pages beyond the landing/404 shell are code-split so the initial
 * bundle doesn't pay for Team Builder, Calculator, etc. until the user
 * actually navigates there. Named exports are remapped to the `default`
 * shape `React.lazy` expects. */
const AbilityDetail = lazy(() =>
  import("@/pages/abilities/AbilityDetail").then((m) => ({ default: m.AbilityDetail })),
);
const AccountPage = lazy(() =>
  import("@/pages/auth/AccountPage").then((m) => ({ default: m.AccountPage })),
);
const LoginPage = lazy(() =>
  import("@/pages/auth/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const SignupPage = lazy(() =>
  import("@/pages/auth/SignupPage").then((m) => ({ default: m.SignupPage })),
);
const CalculatorPage = lazy(() =>
  import("@/pages/calculator/CalculatorPage").then((m) => ({ default: m.CalculatorPage })),
);
const ItemDetail = lazy(() =>
  import("@/pages/items/ItemDetail").then((m) => ({ default: m.ItemDetail })),
);
const MoveDetail = lazy(() =>
  import("@/pages/moves/MoveDetail").then((m) => ({ default: m.MoveDetail })),
);
const PokedexBrowser = lazy(() =>
  import("@/pages/pokedex/PokedexBrowser").then((m) => ({ default: m.PokedexBrowser })),
);
const PokemonDetail = lazy(() =>
  import("@/pages/pokedex/PokemonDetail").then((m) => ({ default: m.PokemonDetail })),
);
const TeamBuilderPage = lazy(() =>
  import("@/pages/team-builder/TeamBuilderPage").then((m) => ({ default: m.TeamBuilderPage })),
);
const AnalyticsPage = lazy(() =>
  import("@/pages/analytics/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage })),
);
const TypeDetail = lazy(() =>
  import("@/pages/types/TypeDetail").then((m) => ({ default: m.TypeDetail })),
);

function App() {
  // Per-route title/description/etc. is set by each page's <Seo> — see
  // Docs/frontend/README.md's SEO section. index.html's <title> is only the
  // pre-hydration fallback.
  const theme = useThemeStore((state) => state.theme);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="pokedex" element={<PokedexBrowser />} />
        <Route path="pokedex/:speciesId" element={<PokemonDetail />} />
        <Route path="moves/:moveId" element={<MoveDetail />} />
        <Route path="abilities/:abilityId" element={<AbilityDetail />} />
        <Route path="types/:type" element={<TypeDetail />} />
        <Route path="items/:itemId" element={<ItemDetail />} />
        <Route path="calculator" element={<CalculatorPage />} />
        <Route path="team-builder" element={<TeamBuilderPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        {/* Dedicated /professor page retired — Rotom floating chat is primary.
         * Old bookmarks land home; homepage still embeds Professor for demos. */}
        <Route path="professor" element={<Navigate to="/" replace />} />
        <Route path="coach" element={<Navigate to="/" replace />} />
        <Route path="professor/check-in" element={<Navigate to="/" replace />} />
        <Route path="coach/check-in" element={<Navigate to="/" replace />} />
        <Route path="replay-coach" element={<Navigate to="/" replace />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route element={<RequireAuth />}>
          <Route path="account" element={<AccountPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;
