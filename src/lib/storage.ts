import { z } from "zod";
import { categories, themes, type AppState } from "../types";
import { createSeed } from "../data/seed";
import { departments, registrationSchema, years } from "./schemas";
export const STORAGE_KEY = "campuspass.demo.v1";
const isoDate = z.string().datetime();
const persistedEvent = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    category: z.enum(categories),
    description: z.string(),
    start: isoDate,
    end: isoDate,
    venue: z.string(),
    organizer: z.string(),
    capacity: z.number().int().positive().max(10000),
    initialReservations: z.number().int().nonnegative(),
    theme: z.enum(themes),
    createdLocally: z.boolean(),
    agenda: z.array(z.object({ time: z.string(), title: z.string() })),
  })
  .refine(
    (e) =>
      e.initialReservations <= e.capacity &&
      Date.parse(e.end) > Date.parse(e.start),
  );
const persistedRegistration = z.object({
  ...registrationSchema.shape,
  department: z.enum(departments),
  year: z.enum(years),
  consent: z.literal(true),
  id: z.string().min(1),
  eventId: z.string().min(1),
  createdAt: isoDate,
  status: z.enum(["confirmed", "cancelled"]),
});
const persistedState = z.object({
  version: z.literal(1),
  events: z.array(persistedEvent),
  registrations: z.array(persistedRegistration),
  bookmarks: z.array(z.object({ eventId: z.string() })),
});
export function parseStoredState(raw: string): AppState {
  const state = persistedState.parse(JSON.parse(raw));
  if (
    new Set(state.events.map((e) => e.id)).size !== state.events.length ||
    new Set(state.registrations.map((r) => r.id)).size !==
      state.registrations.length
  )
    throw new Error("Duplicate record IDs");
  const ids = new Set(state.events.map((e) => e.id));
  state.registrations = state.registrations.filter((r) => ids.has(r.eventId));
  state.bookmarks = [
    ...new Map(
      state.bookmarks
        .filter((b) => ids.has(b.eventId))
        .map((b) => [b.eventId, b]),
    ).values(),
  ];
  const activeKeys = new Set<string>();
  for (const r of state.registrations.filter((r) => r.status === "confirmed")) {
    const key = `${r.eventId}:${r.prn}`;
    if (activeKeys.has(key)) throw new Error("Duplicate active registration");
    activeKeys.add(key);
  }
  if (
    state.events.some(
      (e) =>
        e.initialReservations +
          state.registrations.filter(
            (r) => r.eventId === e.id && r.status === "confirmed",
          ).length >
        e.capacity,
    )
  )
    throw new Error("Overbooked data");
  return state;
}
export function loadStorage(): { state: AppState; notice: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return { state: raw ? parseStoredState(raw) : createSeed(), notice: "" };
  } catch {
    return {
      state: createSeed(),
      notice:
        "Your saved demo could not be read. A fresh set of events has been restored.",
    };
  }
}
