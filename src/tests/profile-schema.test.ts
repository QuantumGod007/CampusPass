import { describe, expect, it } from "vitest";
import { profileSchema, accountSchema } from "../lib/profiles/schema";
import { profileValues, profileAccount } from "./profile-fixtures";
describe("real account validation", () => {
  it("preserves leading-zero PRNs and trims personal details", () => {
    expect(
      profileSchema.parse({
        ...profileValues,
        displayName: "  Aarya Student  ",
      }),
    ).toEqual(profileValues);
  });
  it.each([
    { prn: "123" },
    { prn: "12345678901a" },
    { department: "Invented" },
    { academicYear: "Fifth year" },
    { displayName: "1" },
    { displayName: "A\nName" },
    { displayName: "A".repeat(81) },
  ])("rejects invalid account details %j", (invalid) => {
    expect(
      profileSchema.safeParse({ ...profileValues, ...invalid }).success,
    ).toBe(false);
  });
  it("accepts international names and validates the database account shape", () => {
    expect(
      profileSchema.safeParse({ ...profileValues, displayName: "आदित्य पाटील" })
        .success,
    ).toBe(true);
    expect(
      accountSchema.safeParse(profileAccount(undefined, true)).success,
    ).toBe(true);
  });
  it("refuses unsupported administrator roles in a profile response", () => {
    const account = profileAccount();
    expect(
      accountSchema.safeParse({
        ...account,
        membership: {
          id: account.user_id,
          institution_id: account.user_id,
          institution_name: "Test",
          status: "active",
          role: "admin",
          expires_at: null,
        },
      }).success,
    ).toBe(false);
  });
});
