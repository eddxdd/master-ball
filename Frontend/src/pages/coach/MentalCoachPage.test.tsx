import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MentalCoachPage } from "@/pages/coach/MentalCoachPage";

const { postBattleLogMock, getBattleLogMock } = vi.hoisted(() => ({
  postBattleLogMock: vi.fn(),
  getBattleLogMock: vi.fn(),
}));

vi.mock("@/lib/clientId", () => ({ getClientId: () => "test-client-id" }));
vi.mock("@/lib/sessionApi", () => ({
  postBattleLog: postBattleLogMock,
  getBattleLog: getBattleLogMock,
  postLossReview: vi.fn(),
}));
vi.mock("@/hooks/usePushSubscription", () => ({
  usePushSubscription: () => ({
    state: "unconfigured",
    busy: false,
    error: null,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }),
}));
// Phase 7's on-device mood model runs a real Worker + downloaded ML model —
// neither is available/appropriate in jsdom, so this mock stands in for it
// here (mirroring usePushSubscription's mock above) while
// useOnDeviceMood.test.tsx-equivalent coverage of the real hook behavior
// isn't practical without a real browser. See src/workers/moodWorker.ts's
// module docstring for the real implementation this replaces.
const { useOnDeviceMoodMock } = vi.hoisted(() => ({ useOnDeviceMoodMock: vi.fn() }));
vi.mock("@/hooks/useOnDeviceMood", async () => {
  const actual =
    await vi.importActual<typeof import("@/hooks/useOnDeviceMood")>("@/hooks/useOnDeviceMood");
  return { ...actual, useOnDeviceMood: useOnDeviceMoodMock };
});

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MentalCoachPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("MentalCoachPage", () => {
  beforeEach(() => {
    useOnDeviceMoodMock.mockReturnValue({ status: "idle", label: null, score: null, error: null });
  });

  it("shows the tilt nudge banner after a two-loss streak is logged", async () => {
    getBattleLogMock.mockResolvedValue([]);
    postBattleLogMock.mockResolvedValue({
      entry: { id: 1, result: "loss", note: null, created_at: new Date().toISOString() },
      tilt_check: {
        consecutive_losses: 2,
        nudge: true,
        message:
          "That's 2 losses in a row — want a break, or a quick postmortem instead of queuing again?",
      },
      push_sent: false,
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Log result" }));

    await waitFor(() => {
      expect(screen.getByText(/That's 2 losses in a row/)).toBeInTheDocument();
    });
  });

  it("shows a friendly message when push notifications aren't configured", () => {
    getBattleLogMock.mockResolvedValue([]);
    renderPage();

    expect(screen.getByText(/Push notifications aren't configured/)).toBeInTheDocument();
  });

  it("shows nothing from the on-device mood model while the note is empty", () => {
    getBattleLogMock.mockResolvedValue([]);
    useOnDeviceMoodMock.mockReturnValue({
      status: "ready",
      label: "negative",
      score: 0.9,
      error: null,
    });
    renderPage();

    expect(screen.queryByText(/Sounds frustrated/)).not.toBeInTheDocument();
  });

  it("shows the on-device mood badge once a note is written and classified", () => {
    getBattleLogMock.mockResolvedValue([]);
    useOnDeviceMoodMock.mockReturnValue({
      status: "ready",
      label: "negative",
      score: 0.94,
      error: null,
    });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/got swept by a Choice Scarf Dragapult/), {
      target: { value: "That was infuriating" },
    });

    expect(screen.getByText(/Sounds frustrated/)).toBeInTheDocument();
    expect(screen.getByText(/Runs locally in your browser/)).toBeInTheDocument();
  });

  it("shows a loading message while the on-device model downloads", () => {
    getBattleLogMock.mockResolvedValue([]);
    useOnDeviceMoodMock.mockReturnValue({
      status: "loading-model",
      label: null,
      score: null,
      error: null,
    });
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/got swept by a Choice Scarf Dragapult/), {
      target: { value: "One sec" },
    });

    expect(screen.getByText(/one-time download/)).toBeInTheDocument();
  });
});
