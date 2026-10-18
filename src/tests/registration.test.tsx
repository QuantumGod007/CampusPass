import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { StoreProvider } from "../app/store";
import { ToastProvider } from "../components/toast";
import { Register } from "../features/registration/register";
function setup() {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/events/buildfest/register"]}>
      <StoreProvider>
        <ToastProvider>
          <Routes>
            <Route path="/events/:eventId/register" element={<Register />} />
            <Route
              path="/bookings/:bookingId"
              element={<h1>Booking saved</h1>}
            />
          </Routes>
        </ToastProvider>
      </StoreProvider>
    </MemoryRouter>,
  );
  return user;
}
describe("registration form interaction", () => {
  it("exposes required fields without changing the visible labels", () => {
    setup();
    for (const label of [
      "Full name",
      "Email address",
      "Mobile number",
      "Student PRN",
      "Department",
      "Academic year",
    ]) {
      expect(screen.getByLabelText(label)).toHaveAttribute(
        "aria-required",
        "true",
      );
    }
    expect(screen.getByRole("checkbox")).toHaveAttribute(
      "aria-required",
      "true",
    );
  });
  it("shows inline errors, focuses the first invalid field and retains values", async () => {
    const user = setup();
    await user.click(
      screen.getByRole("button", { name: "Confirm registration" }),
    );
    expect(
      await screen.findByText("Please enter your full name."),
    ).toBeVisible();
    expect(screen.getByLabelText("Full name")).toHaveFocus();
    await user.type(screen.getByLabelText("Full name"), "Aarya Deshmukh");
    await user.type(screen.getByLabelText("Email address"), "broken-email");
    await user.tab();
    expect(
      await screen.findByText("Enter a valid email address."),
    ).toBeVisible();
    expect(screen.getByLabelText("Full name")).toHaveValue("Aarya Deshmukh");
    expect(
      screen.queryByText("Please enter your full name."),
    ).not.toBeInTheDocument();
  });
  it("submits once with valid details and moves to the pass route", async () => {
    const user = setup();
    await user.type(screen.getByLabelText("Full name"), "Aarya Deshmukh");
    await user.type(
      screen.getByLabelText("Email address"),
      "aarya@example.com",
    );
    await user.type(screen.getByLabelText("Mobile number"), "9876543210");
    await user.type(screen.getByLabelText("Student PRN"), "002026123456");
    await user.selectOptions(
      screen.getByLabelText("Department"),
      "Computer Science",
    );
    await user.selectOptions(
      screen.getByLabelText("Academic year"),
      "Second year",
    );
    await user.click(screen.getByRole("checkbox"));
    await user.dblClick(
      screen.getByRole("button", { name: "Confirm registration" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Booking saved" }),
    ).toBeVisible();
    const saved = JSON.parse(localStorage.getItem("campuspass.demo.v1")!);
    expect(saved.registrations).toHaveLength(1);
    expect(saved.registrations[0].prn).toBe("002026123456");
  });
  it("keeps the form usable when browser storage writes are blocked", () => {
    // Loading and rendering must remain usable in privacy modes.
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceeded");
      });
    setup();
    expect(
      screen.getByRole("button", { name: "Confirm registration" }),
    ).toBeVisible();
    spy.mockRestore();
  });
});
