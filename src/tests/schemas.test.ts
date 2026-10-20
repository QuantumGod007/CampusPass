import { describe, expect, it } from "vitest";
import {
  eventSchema,
  normalizeMobile,
  registrationSchema,
} from "../lib/schemas";
import { student, organizerInput } from "./fixtures";
describe("student validation", () => {
  it.each(["", " ", "A", "12", ".."])(
    "rejects a name without two meaningful letters: %s",
    (fullName) => {
      expect(
        registrationSchema.safeParse({ ...student, fullName }).success,
      ).toBe(false);
    },
  );
  it.each(["", "aarya", "aarya@", "@example.com"])(
    "rejects malformed email: %s",
    (email) => {
      expect(registrationSchema.safeParse({ ...student, email }).success).toBe(
        false,
      );
    },
  );
  it("allows any valid email domain", () => {
    expect(
      registrationSchema.safeParse({ ...student, email: "student@outlook.com" })
        .success,
    ).toBe(true);
  });
  it.each([
    "987654321",
    "98765432101",
    "1234567890",
    "5123456789",
    "987654ABCD",
    "+44 9876543210",
    "+91 98765432109",
  ])("rejects invalid Indian mobile: %s", (mobile) => {
    expect(registrationSchema.safeParse({ ...student, mobile }).success).toBe(
      false,
    );
  });
  it.each([
    "9876543210",
    "+91 98765 43210",
    "91-98765-43210",
    "(987) 654-3210",
  ])("normalizes supported mobile formatting: %s", (mobile) => {
    expect(normalizeMobile(mobile)).toBe("9876543210");
  });
  it.each(["123", "12345678901A", "1234567890123", ""])(
    "rejects non-12-digit PRNs: %s",
    (prn) => {
      expect(registrationSchema.safeParse({ ...student, prn }).success).toBe(
        false,
      );
    },
  );
  it("requires valid department, year, consent and a short note", () => {
    for (const invalid of [
      { department: "" },
      { department: "Invented" },
      { year: "" },
      { year: "Fifth year" },
      { consent: false },
      { note: "a".repeat(501) },
    ])
      expect(
        registrationSchema.safeParse({ ...student, ...invalid }).success,
      ).toBe(false);
  });
});
describe("organizer validation", () => {
  it("rejects impossible calendar dates and date-only values", () => {
    for (const start of [
      "2099-02-30T12:00",
      "2099-13-01T12:00",
      "2099-01-01",
    ]) {
      expect(
        eventSchema.safeParse({
          ...organizerInput(),
          start,
          end: "2099-12-31T13:00",
        }).success,
      ).toBe(false);
    }
    expect(
      eventSchema.safeParse({
        ...organizerInput(),
        start: "2099-02-28T12:00",
        end: "2099-02-30T13:00",
      }).success,
    ).toBe(false);
  });
  it("accepts local date-time values from the organizer controls", () => {
    expect(
      eventSchema.safeParse({
        ...organizerInput(),
        start: "2099-02-28T12:00",
        end: "2099-02-28T13:00",
      }).success,
    ).toBe(true);
  });
  it.each(["0", "-1", "1.2", "1e2", "", "10001"])(
    "rejects invalid capacity: %s",
    (capacity) => {
      expect(
        eventSchema.safeParse({ ...organizerInput(), capacity }).success,
      ).toBe(false);
    },
  );
  it("rejects past, missing and reversed dates", () => {
    const values = organizerInput();
    expect(
      eventSchema.safeParse({ ...values, start: "not a date" }).success,
    ).toBe(false);
    expect(
      eventSchema.safeParse({
        ...values,
        start: new Date(Date.now() - 1000).toISOString(),
      }).success,
    ).toBe(false);
    expect(
      eventSchema.safeParse({
        ...values,
        end: new Date(Date.parse(values.start) - 1000).toISOString(),
      }).success,
    ).toBe(false);
  });
  it("accepts a valid future event and rejects empty required content", () => {
    expect(eventSchema.safeParse(organizerInput()).success).toBe(true);
    for (const field of ["title", "description", "venue", "organizer"])
      expect(
        eventSchema.safeParse({ ...organizerInput(), [field]: "   " }).success,
      ).toBe(false);
  });
});
