import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { useAuth } from "../app/auth";
import { useStudentProfile } from "../app/profile";
import { ProfilePage } from "../features/account/profile-page";
import { ToastProvider } from "../components/toast";
import { authSession } from "./auth-fixtures";
import { profileAccount } from "./profile-fixtures";
vi.mock("../app/auth", () => ({ useAuth: vi.fn() }));
vi.mock("../app/profile", () => ({ useStudentProfile: vi.fn() }));
let state: ReturnType<typeof useStudentProfile>;
beforeEach(() => {
  const session = authSession();
  vi.mocked(useAuth).mockReturnValue({
    status: "authenticated",
    session,
    user: session.user,
    error: null,
    isSigningOut: false,
    isPasswordRecovery: false,
    retry: vi.fn(),
    signOut: vi.fn(),
  });
  state = {
    status: "ready",
    account: profileAccount(),
    error: null,
    isSaving: false,
    reload: vi.fn(),
    save: vi.fn().mockResolvedValue(profileAccount(undefined, true)),
  };
  vi.mocked(useStudentProfile).mockImplementation(() => state);
});
function show() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ProfilePage />
      </ToastProvider>
    </MemoryRouter>,
  );
}
it("shows server-verified email and an honest unprovisioned institution, without fictional demo values", () => {
  show();
  expect(screen.getByText("verified@example.test")).toBeInTheDocument();
  expect(screen.getByText("Enrollment unverified")).toBeInTheDocument();
  expect(screen.getByLabelText("Student PRN")).toHaveValue("");
  expect(screen.queryByLabelText("Institution")).not.toBeInTheDocument();
});
it("focuses invalid fields and does not submit bad profile values", async () => {
  show();
  await userEvent.click(
    screen.getByRole("button", { name: "Create student profile" }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Display name")).toHaveFocus(),
  );
  expect(screen.getByText("PRN must contain exactly 12 digits.")).toBeVisible();
  expect(state.save).not.toHaveBeenCalled();
});
it("disables queued submissions and keeps entered values when saving fails", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(state.save).mockReturnValue(
    new Promise((_resolve, r) => {
      reject = r;
    }),
  );
  show();
  await userEvent.type(screen.getByLabelText("Display name"), "Aarya Student");
  await userEvent.type(screen.getByLabelText("Student PRN"), "002026123456");
  await userEvent.selectOptions(screen.getByLabelText("Department"), "Other");
  await userEvent.selectOptions(
    screen.getByLabelText("Academic year"),
    "First year",
  );
  await userEvent.dblClick(
    screen.getByRole("button", { name: "Create student profile" }),
  );
  expect(state.save).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Display name")).toBeDisabled();
  reject(new Error("Connection failed. Try again."));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Connection failed"),
  );
  expect(screen.getByLabelText("Student PRN")).toHaveValue("002026123456");
  expect(screen.getByLabelText("Display name")).toBeEnabled();
});
it("shows loading and actionable retry states without replacing data with demo records", () => {
  state = { ...state, status: "loading", account: null };
  const view = show();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Loading your account profile",
  );
  state = {
    ...state,
    status: "error",
    error: Object.assign(new Error("Unavailable"), {
      kind: "unavailable" as const,
    }),
  };
  view.rerender(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Unavailable");
});
it("edits only personal fields and allows cancel back to overview", async () => {
  state.account = profileAccount(undefined, true);
  show();
  await userEvent.click(screen.getByRole("button", { name: "Edit profile" }));
  expect(screen.getByLabelText("Student PRN")).toHaveValue("002026123456");
  await userEvent.click(
    screen.getByRole("button", { name: "Cancel editing" }),
  );
  expect(screen.getByRole("button", { name: "Edit profile" })).toBeVisible();
});
