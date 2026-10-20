import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { StoreProvider } from "../app/store";
import { ToastProvider } from "../components/toast";
import { Discover } from "../features/events/discover";
import { Bookings } from "../features/bookings/bookings";

it.each([
  [Discover, "Search events", "Clear search"],
  [Bookings, "Search bookings", "Clear booking search"],
] as const)(
  "returns focus to the search field after clearing in %s",
  async (Page, label, clearLabel) => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <StoreProvider>
          <ToastProvider>
            <Page />
          </ToastProvider>
        </StoreProvider>
      </MemoryRouter>,
    );
    const input = screen.getByLabelText(label);
    await user.type(input, "missing");
    await user.click(screen.getByRole("button", { name: clearLabel }));
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  },
);
