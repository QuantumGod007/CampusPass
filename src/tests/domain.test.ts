import { describe, expect, it } from "vitest";
import { createSeed } from "../data/seed";
import {
  cancelRegistration,
  makeRegistration,
  registrationState,
  saveOrganizerEvent,
  seatsLeft,
} from "../lib/domain";
import { student, organizerInput } from "./fixtures";
describe("registration and capacity invariants", () => {
  it("seeds twelve future events and useful capacity states", () => {
    const state = createSeed();
    expect(state.events).toHaveLength(12);
    expect(state.events.every((e) => Date.parse(e.start) > Date.now())).toBe(
      true,
    );
    expect(state.events.some((e) => seatsLeft(e, []) === 0)).toBe(true);
    expect(
      state.events.some(
        (e) => seatsLeft(e, []) > 0 && seatsLeft(e, []) <= e.capacity * 0.15,
      ),
    ).toBe(true);
  });
  it("normalizes valid input, preserves leading PRN zeros, and consumes one seat", () => {
    const state = createSeed();
    const before = seatsLeft(state.events[0], []);
    const result = makeRegistration(state, "buildfest", student);
    expect(result.registration.prn).toBe("002026123456");
    expect(result.registration.fullName).toBe("Aarya Deshmukh");
    expect(result.registration.mobile).toBe("9876543210");
    expect(seatsLeft(result.state.events[0], result.state.registrations)).toBe(
      before - 1,
    );
    expect(state.registrations).toHaveLength(0);
  });
  it("rejects repeated active PRNs and permits the same PRN at different events", () => {
    const { state } = makeRegistration(createSeed(), "buildfest", student);
    expect(() => makeRegistration(state, "buildfest", student)).toThrow(
      "You've already registered",
    );
    expect(
      makeRegistration(state, "code-coffee", student).state.registrations,
    ).toHaveLength(2);
  });
  it("rejects sold-out, missing, and past events", () => {
    const state = createSeed();
    expect(() => makeRegistration(state, "film-festival", student)).toThrow(
      "fully booked",
    );
    expect(() => makeRegistration(state, undefined, student)).toThrow(
      "could not be found",
    );
    expect(() => makeRegistration(state, "missing", student)).toThrow(
      "could not be found",
    );
    const past = {
      ...state,
      events: state.events.map((e) => ({
        ...e,
        start: new Date(Date.now() - 1000).toISOString(),
      })),
    };
    expect(() => makeRegistration(past, "buildfest", student)).toThrow(
      "closed",
    );
    expect(registrationState(past.events[0], [])).toBe("closed");
  });
  it("never persists invalid input and does not oversell the last seat", () => {
    const state = createSeed();
    state.events[0].initialReservations = 119;
    expect(() =>
      makeRegistration(state, "buildfest", { ...student, prn: "42" }),
    ).toThrow();
    expect(state.registrations).toHaveLength(0);
    const result = makeRegistration(state, "buildfest", student);
    expect(seatsLeft(result.state.events[0], result.state.registrations)).toBe(
      0,
    );
    expect(() =>
      makeRegistration(result.state, "buildfest", {
        ...student,
        prn: "002026123457",
      }),
    ).toThrow("fully booked");
  });
  it("cancels idempotently, releases exactly one seat and allows re-registration", () => {
    const { state, registration } = makeRegistration(
      createSeed(),
      "buildfest",
      student,
    );
    const left = seatsLeft(state.events[0], state.registrations);
    const cancelled = cancelRegistration(state, registration.id);
    expect(cancelled.registrations[0].status).toBe("cancelled");
    expect(seatsLeft(cancelled.events[0], cancelled.registrations)).toBe(
      left + 1,
    );
    const again = cancelRegistration(cancelled, registration.id);
    expect(seatsLeft(again.events[0], again.registrations)).toBe(left + 1);
    expect(
      makeRegistration(again, "buildfest", student).state.registrations,
    ).toHaveLength(2);
  });
  it("rejects cancellation after an event begins", () => {
    const { state, registration } = makeRegistration(
      createSeed(),
      "buildfest",
      student,
    );
    state.events[0].start = new Date(Date.now() - 1000).toISOString();
    expect(() => cancelRegistration(state, registration.id)).toThrow(
      "Past event",
    );
  });
});
describe("organizer mutations", () => {
  it("creates and edits events while preserving registrations and IDs", () => {
    const created = saveOrganizerEvent(createSeed(), organizerInput());
    expect(created.event.createdLocally).toBe(true);
    const booked = makeRegistration(created.state, created.event.id, student);
    const edited = saveOrganizerEvent(
      booked.state,
      { ...organizerInput(), title: "Creative Coding Morning" },
      created.event.id,
    );
    expect(edited.event.id).toBe(created.event.id);
    expect(edited.state.registrations).toEqual(booked.state.registrations);
    expect(edited.event.title).toBe("Creative Coding Morning");
  });
  it("does not lower capacity below existing reservations or edit curated seeds", () => {
    const created = saveOrganizerEvent(createSeed(), organizerInput());
    const one = makeRegistration(created.state, created.event.id, student);
    const two = makeRegistration(one.state, created.event.id, {
      ...student,
      prn: "002026123457",
    });
    expect(() =>
      saveOrganizerEvent(
        two.state,
        { ...organizerInput(), capacity: "1" },
        created.event.id,
      ),
    ).toThrow("2 confirmed");
    expect(() =>
      saveOrganizerEvent(two.state, organizerInput(), "buildfest"),
    ).toThrow("Only locally");
  });
});
