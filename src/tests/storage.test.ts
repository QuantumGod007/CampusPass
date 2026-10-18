import { describe, expect, it, vi } from "vitest";
import { createSeed } from "../data/seed";
import { loadStorage, parseStoredState, STORAGE_KEY } from "../lib/storage";
import { makeRegistration } from "../lib/domain";
import { student } from "./fixtures";
describe("browser persistence and recovery", () => {
  it("round-trips events, leading-zero PRNs and bookmarks", () => {
    const { state } = makeRegistration(createSeed(), "buildfest", student);
    state.bookmarks = [{ eventId: "buildfest" }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const restored = loadStorage();
    expect(restored.notice).toBe("");
    expect(restored.state).toEqual(state);
  });
  it.each(["not json", "null", "{}", '{"version":2}'])(
    "recovers safely from corrupt storage: %s",
    (raw) => {
      localStorage.setItem(STORAGE_KEY, raw);
      expect(loadStorage().state.events).toHaveLength(12);
      expect(loadStorage().notice).toContain("restored");
    },
  );
  it("handles storage that is blocked by the browser", () => {
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("Blocked");
      });
    expect(loadStorage().state.events).toHaveLength(12);
    spy.mockRestore();
  });
  it("removes orphaned records and deduplicates bookmarks", () => {
    const { state } = makeRegistration(createSeed(), "buildfest", student);
    state.events = state.events.filter((e) => e.id !== "buildfest");
    state.bookmarks = [
      { eventId: "buildfest" },
      { eventId: "ai-summit" },
      { eventId: "ai-summit" },
    ];
    const restored = parseStoredState(JSON.stringify(state));
    expect(restored.registrations).toHaveLength(0);
    expect(restored.bookmarks).toEqual([{ eventId: "ai-summit" }]);
  });
  it("rejects overbooked and duplicate active data", () => {
    const { state, registration } = makeRegistration(
      createSeed(),
      "buildfest",
      student,
    );
    state.events[0].initialReservations = 120;
    expect(() => parseStoredState(JSON.stringify(state))).toThrow("Overbooked");
    state.events[0].initialReservations = 0;
    state.registrations.push({ ...registration, id: "another-id" });
    expect(() => parseStoredState(JSON.stringify(state))).toThrow(
      "Duplicate active",
    );
  });
});
