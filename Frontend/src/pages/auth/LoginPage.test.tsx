import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { LoginPage } from "@/pages/auth/LoginPage";
import { useAuthStore } from "@/store/authStore";

const { loginMock } = vi.hoisted(() => ({ loginMock: vi.fn() }));

vi.mock("@/lib/authApi", () => ({
  login: loginMock,
}));

function renderLoginPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/login"]}>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null });
    loginMock.mockReset();
  });

  it("logs in and stores the token + user on success", async () => {
    loginMock.mockResolvedValue({
      access_token: "fake-token",
      token_type: "bearer",
      user: { id: 1, email: "ash@example.com", display_name: "Ash", created_at: "2024-01-01" },
    });

    renderLoginPage();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ash@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-horse" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(useAuthStore.getState().token).toBe("fake-token");
    });
    expect(useAuthStore.getState().user?.display_name).toBe("Ash");
    expect(loginMock).toHaveBeenCalledWith("ash@example.com", "correct-horse");
  });

  it("shows an error message when login fails", async () => {
    loginMock.mockRejectedValue(new ApiError(401, "Invalid email or password."));

    renderLoginPage();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ash@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(screen.getByText("Invalid email or password.")).toBeInTheDocument();
    });
    expect(useAuthStore.getState().token).toBeNull();
  });

  it("disables the submit button until both fields are filled", () => {
    renderLoginPage();
    expect(screen.getByRole("button", { name: "Log in" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ash@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-horse" },
    });

    expect(screen.getByRole("button", { name: "Log in" })).not.toBeDisabled();
  });
});
