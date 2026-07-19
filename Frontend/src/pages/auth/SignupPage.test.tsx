import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { SignupPage } from "@/pages/auth/SignupPage";
import { useAuthStore } from "@/store/authStore";

const { signupMock } = vi.hoisted(() => ({ signupMock: vi.fn() }));

vi.mock("@/lib/authApi", () => ({
  signup: signupMock,
}));

function renderSignupPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/signup"]}>
        <SignupPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function fillForm({
  displayName = "Ash",
  email = "ash@example.com",
  password = "correct-horse",
}: {
  displayName?: string;
  email?: string;
  password?: string;
} = {}) {
  fireEvent.change(screen.getByLabelText("Display name"), { target: { value: displayName } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
}

describe("SignupPage", () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null });
    signupMock.mockReset();
  });

  it("signs up and stores the token + user on success", async () => {
    signupMock.mockResolvedValue({
      access_token: "fake-token",
      token_type: "bearer",
      user: { id: 1, email: "ash@example.com", display_name: "Ash", created_at: "2024-01-01" },
    });

    renderSignupPage();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Create free account" }));

    await waitFor(() => {
      expect(useAuthStore.getState().token).toBe("fake-token");
    });
    expect(signupMock).toHaveBeenCalledWith("ash@example.com", "correct-horse", "Ash");
  });

  it("shows a 409 error message when the email is already taken", async () => {
    signupMock.mockRejectedValue(new ApiError(409, "An account with this email already exists."));

    renderSignupPage();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Create free account" }));

    await waitFor(() => {
      expect(screen.getByText("An account with this email already exists.")).toBeInTheDocument();
    });
    expect(useAuthStore.getState().token).toBeNull();
  });

  it("shows a hint and disables submit while the password is too short", () => {
    renderSignupPage();
    fillForm({ password: "short" });

    expect(screen.getByText("Must be at least 8 characters.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create free account" })).toBeDisabled();
    expect(signupMock).not.toHaveBeenCalled();
  });
});
