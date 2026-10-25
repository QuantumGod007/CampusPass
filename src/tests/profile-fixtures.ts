import { authSession } from "./auth-fixtures";
import type { ProfileAccount } from "../lib/profiles/repository";
export const profileValues = {
  displayName: "Aarya Student",
  prn: "002026123456",
  department: "Computer Science" as const,
  academicYear: "Second year" as const,
};
export function profileAccount(
  id = authSession().user.id,
  existing = false,
): ProfileAccount {
  return {
    user_id: id,
    profile: existing
      ? {
          user_id: id,
          display_name: profileValues.displayName,
          prn: profileValues.prn,
          department: profileValues.department,
          academic_year: profileValues.academicYear,
          institution_id: null,
          created_at: "2026-10-25T10:00:00Z",
          updated_at: "2026-10-25T10:00:00Z",
        }
      : null,
    membership: null,
    user: {
      id,
      email: "verified@example.test",
      emailConfirmedAt: "2026-10-25T09:00:00Z",
    },
  };
}
