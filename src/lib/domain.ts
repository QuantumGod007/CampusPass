import type { AppState, CampusEvent, Registration } from "../types";
import { eventSchema, registrationSchema } from "./schemas";
export function seatsLeft(event: CampusEvent, registrations: Registration[]) {
  return Math.max(
    0,
    event.capacity -
      event.initialReservations -
      registrations.filter(
        (r) => r.eventId === event.id && r.status === "confirmed",
      ).length,
  );
}
export function registrationState(
  event: CampusEvent,
  registrations: Registration[],
  now = Date.now(),
) {
  if (Date.parse(event.start) <= now) return "closed";
  return seatsLeft(event, registrations) === 0 ? "full" : "open";
}
export function makeRegistration(
  state: AppState,
  eventId: string | undefined,
  input: unknown,
  now = new Date(),
  id = `CP-${crypto.randomUUID().toUpperCase()}`,
) {
  const event = state.events.find((e) => e.id === eventId);
  if (!event)
    throw new Error(
      "This event could not be found. Please return to Discover.",
    );
  const values = registrationSchema.parse(input);
  if (registrationState(event, state.registrations, now.getTime()) === "closed")
    throw new Error("Registration has closed for this event.");
  if (
    state.registrations.some(
      (r) =>
        r.eventId === eventId &&
        r.prn === values.prn &&
        r.status === "confirmed",
    )
  )
    throw new Error("You've already registered for this event.");
  if (seatsLeft(event, state.registrations) <= 0)
    throw new Error("This event is fully booked.");
  const registration: Registration = {
    ...values,
    id,
    eventId: event.id,
    createdAt: now.toISOString(),
    status: "confirmed",
  };
  return {
    state: { ...state, registrations: [...state.registrations, registration] },
    registration,
  };
}
export function cancelRegistration(state: AppState, id: string): AppState {
  const registration = state.registrations.find((r) => r.id === id);
  if (!registration) throw new Error("This registration could not be found.");
  if (registration.status === "cancelled") return state;
  const event = state.events.find((e) => e.id === registration.eventId);
  if (!event || Date.parse(event.start) <= Date.now())
    throw new Error("Past event registrations cannot be cancelled.");
  return {
    ...state,
    registrations: state.registrations.map((r) =>
      r.id === id ? { ...r, status: "cancelled" } : r,
    ),
  };
}
export function saveOrganizerEvent(
  state: AppState,
  input: unknown,
  editId?: string,
): { state: AppState; event: CampusEvent } {
  const values = eventSchema.parse(input);
  const existing = editId
    ? state.events.find((e) => e.id === editId)
    : undefined;
  if (editId && (!existing || !existing.createdLocally))
    throw new Error("Only locally created events can be edited.");
  const reserved = existing
    ? existing.initialReservations +
      state.registrations.filter(
        (r) => r.eventId === editId && r.status === "confirmed",
      ).length
    : 0;
  if (values.capacity < reserved)
    throw new Error(
      `Capacity cannot be lower than ${reserved} confirmed reservations.`,
    );
  const event: CampusEvent = {
    ...values,
    start: new Date(values.start).toISOString(),
    end: new Date(values.end).toISOString(),
    id: existing?.id ?? `event-${crypto.randomUUID()}`,
    initialReservations: existing?.initialReservations ?? 0,
    createdLocally: true,
    agenda: existing?.agenda ?? [
      { time: "Arrival", title: "Check in & meet your hosts" },
      { time: "Main session", title: "Join the experience" },
      { time: "Closing", title: "Questions, connections & takeaways" },
    ],
  };
  return {
    state: {
      ...state,
      events: existing
        ? state.events.map((e) => (e.id === editId ? event : e))
        : [...state.events, event],
    },
    event,
  };
}
