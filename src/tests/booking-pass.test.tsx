import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createSeed } from "../data/seed";
import { useStore } from "../app/store";
import { BookingPass } from "../features/bookings/booking-pass";
import { makeRegistration } from "../lib/domain";
import type { CampusEvent, Registration } from "../types";
import { student } from "./fixtures";

vi.mock("../app/store", () => ({ useStore: vi.fn() }));

function setup(
  dates: Partial<Pick<CampusEvent, "start" | "end">> = {},
  status: Registration["status"] = "confirmed",
) {
  const { state } = makeRegistration(createSeed(), "buildfest", student);
  state.events[0] = { ...state.events[0], ...dates };
  state.registrations[0].status = status;
  vi.mocked(useStore).mockReturnValue({ state } as ReturnType<typeof useStore>);
  render(
    <MemoryRouter initialEntries={[`/bookings/${state.registrations[0].id}`]}>
      <Routes>
        <Route path="/bookings/:bookingId" element={<BookingPass />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("booking pass calendar action", () => {
  it("offers calendar export for a confirmed booking", () => {
    setup();
    expect(
      screen.getByRole("link", { name: "Add to Calendar" }),
    ).toHaveAttribute("target", "_blank");
    expect(
      screen.getByRole("link", { name: "Add to Calendar" }),
    ).toHaveAccessibleDescription(
      "Opens a Google Calendar draft in a new tab. Review the event and save it there.",
    );
  });

  it("offers the secondary ICS download and closes the disclosure with Escape", async () => {
    const user = userEvent.setup();
    setup();
    const toggle = screen.getByRole("button", {
      name: "More calendar options",
    });
    await user.click(toggle);
    expect(
      screen.getByRole("button", { name: /Apple Calendar \/ Outlook/ }),
    ).toBeVisible();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: /Apple Calendar \/ Outlook/ }),
    ).not.toBeInTheDocument();
  });

  it("dismisses calendar options when focus or a pointer moves outside", async () => {
    const user = userEvent.setup();
    setup();
    const toggle = screen.getByRole("button", {
      name: "More calendar options",
    });
    await user.click(toggle);
    await user.click(
      screen.getByRole("heading", { name: "You’re on the list." }),
    );
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("disables calendar export for cancelled bookings", () => {
    setup({}, "cancelled");
    expect(
      screen.getByRole("button", { name: "Add to Calendar" }),
    ).toBeDisabled();
  });

  it.each([
    { start: undefined },
    { end: undefined },
    { start: "not a date" },
    { end: "not a date" },
    { start: "2026-02-30T09:00:00Z" },
    { start: "2026-10-22T09:00:00Z", end: "2026-10-21T09:00:00Z" },
  ])("keeps the pass usable when event dates are invalid: %j", (dates) => {
    setup(dates);
    expect(
      screen.getByRole("heading", { name: "You’re on the list." }),
    ).toBeVisible();
    expect(screen.getByText("Event time unavailable")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Add to Calendar" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Add to Calendar" }),
    ).toHaveAccessibleDescription(
      "Calendar export is unavailable because the event dates are missing or invalid.",
    );
  });

  it("does not download anything when the action is disabled", async () => {
    setup({}, "cancelled");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
    try {
      await userEvent.click(
        screen.getByRole("button", { name: "Add to Calendar" }),
      );
      expect(click).not.toHaveBeenCalled();
    } finally {
      click.mockRestore();
    }
  });
});
