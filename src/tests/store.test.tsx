import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StoreProvider, useStore } from "../app/store";
import { createSeed } from "../data/seed";
import { STORAGE_KEY } from "../lib/storage";
import { student } from "./fixtures";

describe("shared store persistence boundaries", () => {
  it("clears stale records when another tab clears localStorage", () => {
    const { result } = renderHook(useStore, { wrapper: StoreProvider });
    act(() => {
      result.current.toggleBookmark("buildfest");
      result.current.register("buildfest", student);
    });
    expect(result.current.state.registrations).toHaveLength(1);
    act(() => {
      localStorage.clear();
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: null,
          newValue: null,
          storageArea: localStorage,
        }),
      );
    });
    expect(result.current.state.bookmarks).toHaveLength(0);
    expect(result.current.state.registrations).toHaveLength(0);
    expect(result.current.state.events).toHaveLength(12);
  });

  it("does not import a sessionStorage update into the local demo", () => {
    const { result } = renderHook(useStore, { wrapper: StoreProvider });
    act(() => result.current.toggleBookmark("buildfest"));
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: JSON.stringify(createSeed()),
          storageArea: sessionStorage,
        }),
      ),
    );
    expect(result.current.state.bookmarks).toEqual([{ eventId: "buildfest" }]);
  });

  it("imports valid localStorage updates and preserves state on invalid updates", () => {
    const { result } = renderHook(useStore, { wrapper: StoreProvider });
    const remote = createSeed();
    remote.bookmarks = [{ eventId: "design-after-dark" }];
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: JSON.stringify(remote),
          storageArea: localStorage,
        }),
      ),
    );
    expect(result.current.state.bookmarks).toEqual(remote.bookmarks);
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: "invalid JSON",
          storageArea: localStorage,
        }),
      ),
    );
    expect(result.current.state.bookmarks).toEqual(remote.bookmarks);
    expect(result.current.notice).toContain(
      "current session has been preserved",
    );
  });

  it("keeps a valid in-memory booking and reports unavailable storage", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    try {
      const { result } = renderHook(useStore, { wrapper: StoreProvider });
      act(() => {
        result.current.register("buildfest", student);
      });
      expect(result.current.state.registrations).toHaveLength(1);
      expect(result.current.notice).toContain("only for this session");
    } finally {
      spy.mockRestore();
    }
  });

  it("prevents same-tick duplicate bookings before React re-renders", () => {
    const { result } = renderHook(useStore, { wrapper: StoreProvider });
    act(() => {
      result.current.register("buildfest", student);
      expect(() => result.current.register("buildfest", student)).toThrow(
        "You've already registered",
      );
    });
    expect(result.current.state.registrations).toHaveLength(1);
  });
});
