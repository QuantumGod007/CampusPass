import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
  it("limits typing to ten phone digits and twelve PRN digits without losing leading zeros", async () => {
    const user = setup();
    const mobile = screen.getByLabelText("Mobile number");
    const prn = screen.getByLabelText("Student PRN");
    await user.type(mobile, "98765abc43210999");
    await user.type(prn, "00ab2026123456999");
    expect(mobile).toHaveValue("9876543210");
    expect(mobile).toHaveAttribute("maxlength", "10");
    expect(mobile).toHaveAttribute("type", "tel");
    expect(mobile).toHaveAttribute("inputmode", "numeric");
    expect(prn).toHaveValue("002026123456");
    expect(prn).toHaveAttribute("maxlength", "12");
    expect(prn).toHaveAttribute("inputmode", "numeric");
  });

  it("sanitizes formatted pastes before applying limits and supports replacement and deletion", async () => {
    const user = setup();
    const mobile = screen.getByLabelText("Mobile number") as HTMLInputElement;
    const prn = screen.getByLabelText("Student PRN") as HTMLInputElement;
    await user.click(mobile);
    await user.paste("+91 (98765) 43210");
    expect(mobile).toHaveValue("9876543210");
    mobile.setSelectionRange(2, 4);
    await user.paste("00");
    expect(mobile).toHaveValue("9800543210");
    expect(mobile.selectionStart).toBe(4);
    await user.keyboard("{Backspace}");
    expect(mobile).toHaveValue("980543210");
    await user.click(prn);
    await user.paste("00 2026-123456789");
    expect(prn).toHaveValue("002026123456");
  });

  it("normalizes autofill input and clears field-specific errors when corrected", async () => {
    const user = setup();
    const mobile = screen.getByLabelText("Mobile number");
    const prn = screen.getByLabelText("Student PRN");
    await user.type(screen.getByLabelText("Full name"), "Aarya Deshmukh");
    fireEvent.change(mobile, { target: { value: "5123456789" } });
    fireEvent.blur(mobile);
    expect(
      await screen.findByText(
        "Enter a valid Indian mobile number starting with 6, 7, 8, or 9.",
      ),
    ).toBeVisible();
    fireEvent.change(mobile, { target: { value: "+91 98765 43210" } });
    expect(mobile).toHaveValue("9876543210");
    await vi.waitFor(() =>
      expect(mobile).toHaveAttribute("aria-invalid", "false"),
    );
    fireEvent.change(prn, { target: { value: "00202612345" } });
    fireEvent.blur(prn);
    expect(
      await screen.findByText("PRN must contain exactly 12 digits."),
    ).toBeVisible();
    fireEvent.change(prn, { target: { value: "002026123456789" } });
    expect(prn).toHaveValue("002026123456");
    await vi.waitFor(() =>
      expect(prn).toHaveAttribute("aria-invalid", "false"),
    );
    expect(screen.getByLabelText("Full name")).toHaveValue("Aarya Deshmukh");
  });
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
