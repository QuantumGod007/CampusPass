import { describe, expect, it } from "vitest";
import {
  authErrorMessage,
  loginSchema,
  safeAuthRedirect,
  signupSchema,
} from "../lib/auth/forms";

describe("student authentication validation", () => {
  it("trims email while preserving passwords exactly, including spaces", () => {
    expect(
      loginSchema.parse({
        email: " student@example.test ",
        password: " password ",
      }),
    ).toEqual({ email: "student@example.test", password: " password " });
  });

  it.each(["", "student", "student@", "@example.test"])(
    "rejects an invalid email: %s",
    (email) => {
      expect(
        loginSchema.safeParse({ email, password: "password" }).success,
      ).toBe(false);
    },
  );

  it("does not impose the new signup policy on existing login passwords", () => {
    expect(
      loginSchema.safeParse({ email: "student@example.test", password: "old" })
        .success,
    ).toBe(true);
    expect(
      loginSchema.safeParse({ email: "student@example.test", password: "" })
        .success,
    ).toBe(false);
  });

  it("requires at least eight characters and matching confirmation for signup", () => {
    const input = {
      email: "student@example.test",
      password: "password",
      confirmPassword: "password",
    };
    expect(signupSchema.safeParse(input).success).toBe(true);
    expect(
      signupSchema.safeParse({
        ...input,
        password: "short",
        confirmPassword: "short",
      }).success,
    ).toBe(false);
    const mismatch = signupSchema.safeParse({
      ...input,
      confirmPassword: "different",
    });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success)
      expect(mismatch.error.issues[0].path).toEqual(["confirmPassword"]);
  });

  it("enforces the password byte limit for Unicode as well as ASCII", () => {
    for (const password of ["a".repeat(73), "é".repeat(37)]) {
      expect(
        signupSchema.safeParse({
          email: "student@example.test",
          password,
          confirmPassword: password,
        }).success,
      ).toBe(false);
    }
    const password = "é".repeat(36);
    expect(
      signupSchema.safeParse({
        email: "student@example.test",
        password,
        confirmPassword: password,
      }).success,
    ).toBe(true);
  });
});

describe("authentication return destinations", () => {
  it.each([
    "/",
    "/saved",
    "/bookings",
    "/bookings/CP-123",
    "/campus/notifications",
    "/events/buildfest",
    "/events/buildfest/register",
  ])("retains a supported local destination: %s", (target) => {
    expect(safeAuthRedirect(target)).toBe(target);
  });

  it.each([
    undefined,
    null,
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/%2f%2fevil.example",
    "/%252f%252fevil.example",
    "javascript:alert(1)",
    "/login",
    "/signup",
    "/auth/callback",
    "/organizer",
    "/account",
    "/events/../login",
    "/saved?next=https://evil.example",
    "/campus/notifications/other",
    "/campus/notifications?next=https://evil.example",
    "/saved#fragment",
    "/saved\n",
    "/saved\r\n",
    " /saved",
  ])(
    "falls back safely for unsupported or hostile destinations: %s",
    (target) => {
      expect(safeAuthRedirect(target)).toBe("/");
    },
  );
});

describe("safe authentication errors", () => {
  it.each([
    [{ code: "invalid_credentials" }, "email or password is incorrect"],
    [{ code: "email_not_confirmed" }, "Confirm your email"],
    [{ status: 429 }, "Too many attempts"],
    [{ code: "over_email_send_rate_limit" }, "Too many attempts"],
    [{ code: "weak_password" }, "stronger password"],
    [{ code: "user_already_exists" }, "Try signing in"],
  ])("maps a known SDK error to helpful copy", (error, message) => {
    expect(authErrorMessage(error, "login")).toContain(message);
  });

  it("never echoes unrecognized provider details, passwords, or tokens", () => {
    const secret = "sensitive-password-and-token";
    for (const error of [
      new Error(secret),
      { message: secret },
      secret,
      null,
    ]) {
      for (const action of ["login", "signup"] as const) {
        expect(authErrorMessage(error, action)).not.toContain(secret);
      }
    }
  });
});
