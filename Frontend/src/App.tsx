import { useEffect } from "react";
import { Route, Routes } from "react-router";
import { APP_NAME } from "@/config/branding";
import { AppLayout } from "@/layout/AppLayout";
import { CalculatorPage } from "@/pages/calculator/CalculatorPage";
import { HomePage } from "@/pages/HomePage";
import { PokedexBrowser } from "@/pages/pokedex/PokedexBrowser";
import { PokemonDetail } from "@/pages/pokedex/PokemonDetail";
import { TeamBuilderPage } from "@/pages/team-builder/TeamBuilderPage";

function App() {
  useEffect(() => {
    document.title = APP_NAME;
  }, []);

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="pokedex" element={<PokedexBrowser />} />
        <Route path="pokedex/:speciesId" element={<PokemonDetail />} />
        <Route path="calculator" element={<CalculatorPage />} />
        <Route path="team-builder" element={<TeamBuilderPage />} />
      </Route>
    </Routes>
  );
}

export default App;
