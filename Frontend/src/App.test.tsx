import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

vi.mock("@/hooks/useHealth", () => ({
  useHealth: () => ({
    data: { status: "ok", app_name: "Master Ball" },
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
  it("renders the home page with the app name", () => {
    renderApp("/");

    expect(screen.getByRole("heading", { name: "Master Ball" })).toBeInTheDocument();
  });

  it("renders nav links to the Pokedex, Calculator, Team Builder, and Analytics", () => {
    renderApp("/");

    const nav = document.getElementById("site-nav");
    expect(nav).toBeTruthy();
    expect(nav).toHaveTextContent("Pokedex");
    expect(nav).toHaveTextContent("Calculator");
    expect(nav).toHaveTextContent("Team Builder");
    expect(nav).toHaveTextContent("Analytics");
  });

  it("sets a page-specific document title via Seo — see Docs/frontend/README.md's SEO section", () => {
    renderApp("/");

    expect(document.title).toBe("AI-Powered Competitive Pokemon Companion | Master Ball");
    expect(
      document.querySelector('meta[name="description"]')?.getAttribute("content"),
    ).toBeTruthy();
  });

  it("renders the noindex 404 page for unmatched routes instead of a blank screen", () => {
    renderApp("/this-route-does-not-exist");

    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "noindex, nofollow",
    );
  });
});
