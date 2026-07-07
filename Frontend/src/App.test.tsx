import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
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

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("App", () => {
  it("renders the app name and the backend-connected indicator", () => {
    renderWithQueryClient(<App />);

    expect(screen.getByRole("heading", { name: "DexTrAIner" })).toBeInTheDocument();
    expect(screen.getByText(/Backend connected/)).toBeInTheDocument();
  });
});
