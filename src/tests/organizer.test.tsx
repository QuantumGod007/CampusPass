import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StoreProvider } from "../app/store";
import { ToastProvider } from "../components/toast";
import { EventForm } from "../features/organizer/event-form";
import { localDateInput } from "../lib/utils";
import { STORAGE_KEY } from "../lib/storage";
import { organizerInput } from "./fixtures";
import { createSeed } from "../data/seed";
import { themes } from "../types";

describe("organizer form submission", () => {
  it("offers every supported poster and preserves an existing coffee selection", () => {
    const event = {
      ...createSeed().events[0],
      theme: "coffee" as const,
      createdLocally: true,
    };
    render(
      <StoreProvider>
        <ToastProvider>
          <EventForm event={event} onSaved={() => {}} />
        </ToastProvider>
      </StoreProvider>,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(themes.length);
    expect(
      screen.getByRole("radio", { name: "Coffee & conversation" }),
    ).toBeChecked();
  });
  it("creates only one event for two queued submit events", async () => {
    const onSaved = vi.fn();
    const { container } = render(
      <StoreProvider>
        <ToastProvider>
          <EventForm onSaved={onSaved} />
        </ToastProvider>
      </StoreProvider>,
    );
    const values = organizerInput();
    for (const [label, value] of Object.entries({
      "Event title": values.title,
      "Organizer name": values.organizer,
      "The story behind it": values.description,
      Venue: values.venue,
      Capacity: values.capacity,
      "Starts at": localDateInput(values.start),
      "Ends at": localDateInput(values.end),
    })) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    await act(async () => {
      fireEvent.submit(container.querySelector("form")!);
      fireEvent.submit(container.querySelector("form")!);
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).events).toHaveLength(
      13,
    );
  });

  it("associates the existing description hint with its field for assistive technology", () => {
    render(
      <StoreProvider>
        <ToastProvider>
          <EventForm onSaved={() => {}} />
        </ToastProvider>
      </StoreProvider>,
    );
    expect(screen.getByLabelText("The story behind it")).toHaveAttribute(
      "aria-describedby",
      "organizer-description-hint",
    );
    expect(screen.getByLabelText("Event title")).toHaveAttribute(
      "aria-required",
      "true",
    );
  });
});
