import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("@/hooks/useHealth", () => ({
  useHealth: () => ({
    data: { status: "ok", app_name: "DexTrAIner" },
    isPending: false,
    isError: false,
    error: null,
  }),
}));

function renderApp(initialPath = "/") {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("App", () => {
  it("renders the home page with the app name and backend-connected indicator", () => {
    renderApp("/");

    expect(screen.getByRole("heading", { name: "DexTrAIner" })).toBeInTheDocument();
    expect(screen.getByText(/Backend connected/)).toBeInTheDocument();
  });

  it("renders nav links to the Pokedex, Calculator, and Team Builder", () => {
    renderApp("/");

    expect(screen.getByRole("link", { name: "Pokedex" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Calculator" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Team Builder" })).toBeInTheDocument();
  });
});
