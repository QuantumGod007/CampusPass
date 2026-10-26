import { z } from "zod";
import { Constants } from "../../types/database";
export const profileDepartments = Constants.public.Enums.student_department;
export const profileYears = Constants.public.Enums.academic_year;
export const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Enter your name (at least 2 letters).")
    .max(80, "Keep your name under 81 characters.")
    .refine(
      (value) =>
        (value.match(/\p{L}/gu) || []).length >= 2 && !/\p{Cc}/u.test(value),
      "Enter a name containing at least 2 letters and no line breaks.",
    ),
  prn: z
    .string()
    .trim()
    .regex(/^\d{12}$/, "PRN must contain exactly 12 digits."),
  department: z.enum(profileDepartments, { error: "Choose your department." }),
  academicYear: z.enum(profileYears, { error: "Choose your academic year." }),
});
export type ProfileValues = z.infer<typeof profileSchema>;
export const accountSchema = z.object({
  user_id: z.uuid(),
  profile: z
    .object({
      user_id: z.uuid(),
      display_name: z.string(),
      prn: z.string().regex(/^\d{12}$/),
      department: z.enum(profileDepartments),
      academic_year: z.enum(profileYears),
      institution_id: z.uuid().nullable(),
      created_at: z.string(),
      updated_at: z.string(),
    })
    .nullable(),
  membership: z
    .object({
      id: z.uuid(),
      institution_id: z.uuid(),
      institution_name: z.string(),
      status: z.enum(["pending", "active", "revoked", "expired", "inactive"]),
      role: z.enum(["student", "organizer"]),
      expires_at: z.string().nullable(),
    })
    .nullable(),
});
export type StudentAccount = z.infer<typeof accountSchema>;
