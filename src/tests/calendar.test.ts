import { describe, expect, it } from "vitest";
import { createSeed } from "../data/seed";
import {
  createEventCalendar,
  createGoogleCalendarUrl,
  eventCalendarDates,
} from "../lib/calendar";

const event = {
  ...createSeed(new Date("2026-10-18T00:00:00Z")).events[0],
  start: "2026-10-21T09:00:00.123Z",
  end: "2026-10-22T09:00:00.456Z",
};
const generatedAt = new Date("2026-10-18T12:34:56.789Z");
const unfold = (calendar: string) => calendar.replace(/\r\n /g, "");

describe("event calendar export", () => {
  it("exports the actual event data in a complete iCalendar document", () => {
    const calendar = createEventCalendar(event, generatedAt)!;
    const lines = unfold(calendar).split("\r\n");
    expect(lines).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//CampusPass//Event Bookings//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:buildfest@campuspass.local",
      "DTSTAMP:20261018T123456Z",
      "DTSTART:20261021T090000Z",
      "DTEND:20261022T090000Z",
      `SUMMARY:${event.title}`,
      `LOCATION:${event.venue}`,
      `DESCRIPTION:${event.description.replace(/;/g, "\\;").replace(/,/g, "\\,")}`,
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ]);
    expect(calendar.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it.each([
    [
      "2026-10-21T09:00:00+05:30",
      "2026-10-21T12:00:00+05:30",
      "20261021T033000Z",
      "20261021T063000Z",
    ],
    [
      "2026-12-31T23:30:00-08:00",
      "2027-01-01T01:00:00-08:00",
      "20270101T073000Z",
      "20270101T090000Z",
    ],
    [
      "2028-02-29T00:30:00+05:30",
      "2028-02-29T01:30:00+05:30",
      "20280228T190000Z",
      "20280228T200000Z",
    ],
    [
      "2026-03-08T01:30:00-05:00",
      "2026-03-08T03:30:00-04:00",
      "20260308T063000Z",
      "20260308T073000Z",
    ],
    [
      "2026-11-01T01:30:00-04:00",
      "2026-11-01T01:30:00-05:00",
      "20261101T053000Z",
      "20261101T063000Z",
    ],
  ])("preserves absolute times for %s → %s", (start, end, utcStart, utcEnd) => {
    const calendar = createEventCalendar({ ...event, start, end }, generatedAt);
    expect(calendar).toContain(`DTSTART:${utcStart}\r\n`);
    expect(calendar).toContain(`DTEND:${utcEnd}\r\n`);
    expect(calendar).not.toContain("TZID");
    const link = new URL(
      createGoogleCalendarUrl({ ...event, start, end }, "America/New_York")!,
    );
    expect(link.searchParams.get("dates")).toBe(`${utcStart}/${utcEnd}`);
    expect(link.searchParams.get("stz")).toBe("America/New_York");
    expect(link.searchParams.get("etz")).toBe("America/New_York");
  });

  it("escapes all text fields and prevents injected calendar properties", () => {
    const text = "Meet, build; C:\\Campus\r\nEND:VEVENT\nA:B\rNext\u0000";
    const escaped = "Meet\\, build\\; C:\\\\Campus\\nEND:VEVENT\\nA:B\\nNext";
    const calendar = unfold(
      createEventCalendar(
        { ...event, id: text, title: text, venue: text, description: text },
        generatedAt,
      )!,
    );
    for (const field of ["SUMMARY", "LOCATION", "DESCRIPTION"])
      expect(calendar).toContain(`${field}:${escaped}\r\n`);
    expect(calendar).toContain(`UID:${escaped}@campuspass.local\r\n`);
    expect(
      calendar.split("\r\n").filter((line) => line === "END:VEVENT"),
    ).toHaveLength(1);
  });

  it("folds long UTF-8 lines at 75 octets without splitting Unicode", () => {
    const text = "é🎓नमस्ते校园".repeat(30);
    const calendar = createEventCalendar(
      { ...event, title: text, venue: text, description: text },
      generatedAt,
    )!;
    expect(calendar).toContain("\r\n ");
    for (const line of calendar.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
      expect(line).not.toMatch(/\p{Surrogate}/u);
    }
    for (const field of ["SUMMARY", "LOCATION", "DESCRIPTION"])
      expect(unfold(calendar)).toContain(`${field}:${text}\r\n`);
  });

  it("keeps a stable UID across repeated exports and event edits", () => {
    const original = createEventCalendar(event, generatedAt)!;
    const updated = createEventCalendar(
      { ...event, title: "Updated event", start: "2026-10-21T10:00:00Z" },
      new Date("2026-10-19T00:00:00Z"),
    )!;
    const uid = (calendar: string) => calendar.match(/^UID:.+$/m)?.[0];
    expect(uid(updated)).toBe(uid(original));
    expect(updated).toContain("DTSTAMP:20261019T000000Z");
    expect(
      uid(createEventCalendar({ ...event, id: "another-event" })!),
    ).not.toBe(uid(original));
  });

  it.each([
    [undefined, event.end],
    [event.start, undefined],
    ["", event.end],
    [event.start, ""],
    ["not a date", event.end],
    [event.start, "not a date"],
    ["2026-02-30T09:00:00Z", event.end],
    ["2026-02-29T09:00:00Z", event.end],
    [event.start, "2026-10-32T09:00:00Z"],
    ["2026-10-21", event.end],
    ["2026-10-21T09:00:00", event.end],
    [event.start, "2026-10-22T09:00:00"],
    ["2026-10-21T25:00:00Z", event.end],
    [event.start, "2026-10-22T09:00:00+25:00"],
    [event.start, event.start],
    [event.end, event.start],
    ["2026-10-21T09:00:00.100Z", "2026-10-21T09:00:00.200Z"],
    ["0000-01-01T00:00:00Z", event.end],
    [event.start, "9999-12-31T23:30:00-01:00"],
  ])("declines missing, invalid or unordered dates: %s → %s", (start, end) => {
    expect(eventCalendarDates({ start, end })).toBeNull();
    expect(createGoogleCalendarUrl({ ...event, start, end })).toBeNull();
    expect(
      createEventCalendar({ ...event, start, end }, generatedAt),
    ).toBeNull();
  });

  it("declines an invalid generation timestamp without throwing", () => {
    expect(createEventCalendar(event, new Date("invalid"))).toBeNull();
  });

  it("opens Google's event editor with safely encoded, actual event details", () => {
    const text = "Café & code + design? #1; 🎓\nBring C:\\projects = fun";
    const link = new URL(
      createGoogleCalendarUrl(
        { ...event, title: text, venue: text, description: text },
        "Asia/Kolkata",
      )!,
    );
    expect(link.origin + link.pathname).toBe(
      "https://calendar.google.com/calendar/r/eventedit",
    );
    expect(link.searchParams.get("action")).toBe("TEMPLATE");
    for (const key of ["text", "details", "location"])
      expect(link.searchParams.get(key)).toBe(text);
    expect(link.searchParams.get("dates")).toBe(
      "20261021T090000Z/20261022T090000Z",
    );
    expect(link.searchParams.get("stz")).toBe("Asia/Kolkata");
    expect(link.searchParams.get("etz")).toBe("Asia/Kolkata");
    expect(link.searchParams.has("auth")).toBe(false);
  });

  it("uses the device zone and falls back to UTC for unsupported zones without moving the event", () => {
    const device = new URL(createGoogleCalendarUrl(event)!);
    expect(device.searchParams.get("stz")).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    for (const zone of ["", "invalid/zone"]) {
      const fallback = new URL(createGoogleCalendarUrl(event, zone)!);
      expect(fallback.searchParams.get("stz")).toBe("UTC");
      expect(fallback.searchParams.get("dates")).toBe(
        "20261021T090000Z/20261022T090000Z",
      );
    }
  });
});
