import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { CoachPage } from "@/pages/coach/CoachPage";

const { streamChatMessageMock } = vi.hoisted(() => ({ streamChatMessageMock: vi.fn() }));

vi.mock("@/lib/chatApi", () => ({
  streamChatMessage: streamChatMessageMock,
}));

function renderCoachPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CoachPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CoachPage", () => {
  it("shows suggested questions before any message is sent", () => {
    renderCoachPage();

    expect(
      screen.getByRole("button", { name: "What's a good check for Kingambit in OU?" }),
    ).toBeInTheDocument();
  });

  it("sends a suggested question and streams tokens into the assistant bubble", async () => {
    streamChatMessageMock.mockImplementation((_message, callbacks) => {
      callbacks.onToken("Landorus-Therian ");
      callbacks.onToken("is a solid check.");
      callbacks.onDone({
        answer: "Landorus-Therian is a solid check.",
        needsClarification: false,
        citations: [],
      });
      return () => {};
    });

    renderCoachPage();
    fireEvent.click(
      screen.getByRole("button", { name: "What's a good check for Kingambit in OU?" }),
    );

    // Typewriter reveal drains over requestAnimationFrame ticks — wait for
    // the full answer rather than asserting on the first paint.
    await waitFor(() => {
      expect(screen.getByText("Landorus-Therian is a solid check.")).toBeInTheDocument();
    });
    expect(streamChatMessageMock).toHaveBeenCalledWith(
      "What's a good check for Kingambit in OU?",
      expect.any(Object),
      expect.objectContaining({ history: [] }),
    );
  });

  it("renders a WS error as an error bubble instead of crashing", () => {
    streamChatMessageMock.mockImplementation((_message, callbacks) => {
      callbacks.onError("OpenAI isn't configured — set OPENAI_API_KEY to enable the AI agent.");
      return () => {};
    });

    renderCoachPage();
    fireEvent.click(
      screen.getByRole("button", { name: "What's a good check for Kingambit in OU?" }),
    );

    expect(screen.getByText(/OpenAI isn't configured — set OPENAI_API_KEY/)).toBeInTheDocument();
  });
});
