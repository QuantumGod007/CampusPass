import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "../app/auth";
import { getSupabaseClient } from "../lib/auth/client";
import { Login, Signup, AuthCallback } from "../features/auth/auth-page";
import { AuthNavigation } from "../components/auth-navigation";
import { ToastProvider } from "../components/toast";
import { authSession } from "./auth-fixtures";

vi.mock("../app/auth", () => ({ useAuth: vi.fn() }));
vi.mock("../lib/auth/client", () => ({ getSupabaseClient: vi.fn() }));
const session = authSession();
const signInWithPassword = vi.fn();
const signUp = vi.fn();
let auth: ReturnType<typeof useAuth>;

beforeEach(() => {
  auth = {
    status: "unauthenticated",
    session: null,
    user: null,
    error: null,
    isPasswordRecovery: false,
    isSigningOut: false,
    signOut: vi.fn().mockResolvedValue(true),
    retry: vi.fn(),
  };
  vi.mocked(useAuth).mockImplementation(() => auth);
  vi.mocked(getSupabaseClient)
    .mockReset()
    .mockReturnValue({
      auth: { signInWithPassword, signUp },
    } as unknown as SupabaseClient);
  signInWithPassword
    .mockReset()
    .mockResolvedValue({ data: { session }, error: null });
  signUp.mockReset().mockResolvedValue({
    data: { user: session.user, session: null },
    error: null,
  });
});

function Location() {
  const location = useLocation();
  return (
    <span data-testid="location">
      {location.pathname}
      {location.search}
      {location.hash}
    </span>
  );
}
function setup(path = "/login", navigation = false) {
  const user = userEvent.setup();
  function App() {
    return (
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          {navigation && <AuthNavigation />}
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/" element={<h1>Campus discovery</h1>} />
            <Route path="/saved" element={<h1>Saved demo events</h1>} />
          </Routes>
          <Location />
        </ToastProvider>
      </MemoryRouter>
    );
  }
  const view = render(<App />);
  return { ...view, user, refresh: () => view.rerender(<App />) };
}
async function fillLogin(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText("Email address"),
    "student@example.test",
  );
  await user.type(
    screen.getByLabelText("Password", { exact: true }),
    "password123",
  );
}
async function fillSignup(user: ReturnType<typeof userEvent.setup>) {
  await fillLogin(user);
  await user.type(screen.getByLabelText("Confirm password"), "password123");
}

describe("student authentication screens", () => {
  it.each(["/login", "/signup"])(
    "shows an honest unavailable state with no form when disabled: %s",
    (path) => {
      auth.status = "disabled";
      setup(path, true);
      expect(screen.getByText(/Student sign-in isn’t enabled/)).toBeVisible();
      expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Sign in" }),
      ).not.toBeInTheDocument();
      expect(getSupabaseClient).not.toHaveBeenCalled();
    },
  );

  it("exposes loading and retryable session errors without rendering a premature form", async () => {
    auth.status = "loading";
    const view = setup();
    expect(screen.getByRole("status")).toHaveTextContent("ready in a moment");
    expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
    auth.status = "error";
    auth.error = "Set VITE_SUPABASE_URL.";
    view.refresh();
    await view.user.click(screen.getByRole("button", { name: "Try again" }));
    expect(auth.retry).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "temporarily unavailable",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "VITE_SUPABASE_URL",
    );
  });

  it("validates required fields, focuses the first error, and supports password visibility", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter your email address.")).toBeVisible();
    expect(screen.getByLabelText("Email address")).toHaveFocus();
    expect(signInWithPassword).not.toHaveBeenCalled();
    const password = screen.getByLabelText("Password", { exact: true });
    await user.type(password, "a long password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
  });

  it("passes only email/password to Supabase and follows the provider session", async () => {
    const view = setup("/login?next=%2Fsaved");
    await fillLogin(view.user);
    await view.user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(signInWithPassword).toHaveBeenCalledExactlyOnceWith({
        email: "student@example.test",
        password: "password123",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("You’re signed in");
    auth.status = "authenticated";
    auth.user = session.user;
    auth.session = session;
    view.refresh();
    expect(
      await screen.findByRole("heading", { name: "Saved demo events" }),
    ).toBeVisible();
  });

  it.each([
    [
      { code: "invalid_credentials", message: "private-provider-details" },
      "email or password is incorrect",
    ],
    [{ code: "email_not_confirmed" }, "Confirm your email"],
    [{ status: 429 }, "Too many attempts"],
  ])(
    "handles a login error without discarding entered values",
    async (error, message) => {
      signInWithPassword.mockResolvedValueOnce({
        data: { session: null },
        error,
      });
      const { user } = setup();
      await fillLogin(user);
      await user.click(screen.getByRole("button", { name: "Sign in" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(screen.getByRole("alert")).not.toHaveTextContent(
        "private-provider-details",
      );
      expect(screen.getByLabelText("Email address")).toHaveValue(
        "student@example.test",
      );
      expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    },
  );

  it("handles thrown network failures without echoing their details", async () => {
    signInWithPassword.mockRejectedValueOnce(new Error("secret-token"));
    const { user } = setup();
    await fillLogin(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Check your connection",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("secret-token");
  });

  it("allows one request for two queued submissions and shows loading", async () => {
    let resolve!: (value: unknown) => void;
    signInWithPassword.mockReturnValueOnce(
      new Promise((yes) => {
        resolve = yes;
      }),
    );
    const { user } = setup();
    await fillLogin(user);
    const form = screen
      .getByRole("button", { name: "Sign in" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    await act(async () =>
      resolve({
        data: { session: null },
        error: { code: "invalid_credentials" },
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "email or password",
    );
  });

  it("validates signup confirmation and sends no role or extra metadata", async () => {
    const { user } = setup("/signup");
    await fillLogin(user);
    await user.type(screen.getByLabelText("Confirm password"), "different");
    await user.click(
      screen.getByRole("button", { name: "Create student account" }),
    );
    expect(
      await screen.findByText("Your passwords don’t match."),
    ).toBeVisible();
    expect(signUp).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(screen.getByLabelText("Confirm password"), "password123");
    await user.click(
      screen.getByRole("button", { name: "Create student account" }),
    );
    await waitFor(() =>
      expect(signUp).toHaveBeenCalledExactlyOnceWith({
        email: "student@example.test",
        password: "password123",
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Check your inbox." }),
    ).toBeVisible();
    expect(
      screen.queryByLabelText("Password", { exact: true }),
    ).not.toBeInTheDocument();
    expect(auth.status).toBe("unauthenticated");
    await user.click(
      screen.getByRole("button", { name: "Use a different email" }),
    );
    expect(screen.getByLabelText("Email address")).toHaveValue("");
  });

  it("redirects signup only after the provider receives an authenticated session", async () => {
    signUp.mockResolvedValueOnce({
      data: { session, user: session.user },
      error: null,
    });
    const view = setup("/signup?next=%2Fsaved");
    await fillSignup(view.user);
    await view.user.click(
      screen.getByRole("button", { name: "Create student account" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Your account is ready",
    );
    expect(screen.getByTestId("location")).toHaveTextContent("/signup");
    auth.status = "authenticated";
    auth.session = session;
    auth.user = session.user;
    view.refresh();
    expect(
      await screen.findByRole("heading", { name: "Saved demo events" }),
    ).toBeVisible();
  });

  it("shows signup errors without claiming a confirmation email was sent", async () => {
    signUp.mockResolvedValueOnce({
      data: { session: null },
      error: { code: "weak_password" },
    });
    const { user } = setup("/signup");
    await fillSignup(user);
    await user.click(
      screen.getByRole("button", { name: "Create student account" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "stronger password",
    );
    expect(screen.queryByText("Check your inbox.")).not.toBeInTheDocument();
  });

  it("preserves a safe return path while switching between auth pages", async () => {
    const { user } = setup("/login?next=%2Fsaved");
    await user.click(screen.getByRole("link", { name: "Create an account" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/signup?next=%2Fsaved",
    );
    expect(screen.getByLabelText("Confirm password")).toBeVisible();
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/organizer",
    "/auth/callback",
  ])("does not follow an unsafe or unsupported redirect: %s", (target) => {
    auth.status = "authenticated";
    auth.session = session;
    auth.user = session.user;
    setup(`/login?next=${encodeURIComponent(target)}`);
    expect(
      screen.getByRole("heading", { name: "Campus discovery" }),
    ).toBeVisible();
  });

  it("explains failed confirmation links, removes URL parameters, and never echoes provider errors", async () => {
    setup(
      "/auth/callback?code=one-time-code#error=denied&error_description=secret-token",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("expired");
    expect(screen.getByRole("alert")).not.toHaveTextContent("secret-token");
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        /^\/auth\/callback$/,
      ),
    );
  });

  it("completes an email callback through provider state", () => {
    auth.status = "authenticated";
    auth.session = session;
    auth.user = session.user;
    setup("/auth/callback");
    expect(
      screen.getByRole("heading", { name: "Campus discovery" }),
    ).toBeVisible();
  });
});

describe("authenticated navigation", () => {
  it("opens the account dialog and signs out without touching demo data", async () => {
    auth.status = "authenticated";
    auth.user = session.user;
    auth.session = session;
    localStorage.setItem("campuspass.demo.v1", "preserve-demo");
    const { user } = setup("/", true);
    await user.click(screen.getByRole("button", { name: "Open account menu" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(session.user.email!);
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Signed out on this browser",
    );
    expect(localStorage.getItem("campuspass.demo.v1")).toBe("preserve-demo");
  });

  it("reports logout failure without presenting a success notification", async () => {
    auth.status = "authenticated";
    auth.user = session.user;
    auth.session = session;
    vi.mocked(auth.signOut).mockResolvedValueOnce(false);
    const { user } = setup("/", true);
    await user.click(screen.getByRole("button", { name: "Open account menu" }));
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Sign-out could not be confirmed",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
