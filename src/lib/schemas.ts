import { z } from "zod";
import { categories, themes } from "../types";
export const departments = [
  "Computer Science",
  "Information Technology",
  "Electronics & Telecommunication",
  "Mechanical Engineering",
  "Civil Engineering",
  "Business & Management",
  "Design & Arts",
  "Other",
] as const;
export const years = [
  "First year",
  "Second year",
  "Third year",
  "Fourth year",
] as const;
export function normalizeMobile(value: string) {
  const digits = value.trim().replace(/[\s()-]/g, "");
  if (digits.startsWith("+91")) return digits.slice(3);
  if (/^91\d{10}$/.test(digits)) return digits.slice(2);
  return digits;
}
export const registrationSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Please enter your full name.")
    .refine(
      (v) => (v.match(/\p{L}/gu) || []).length >= 2,
      "Your name must contain at least 2 letters.",
    ),
  email: z
    .string()
    .trim()
    .min(1, "Please enter your email address.")
    .email("Enter a valid email address."),
  mobile: z
    .string()
    .transform(normalizeMobile)
    .refine((v) => /^\d{10}$/.test(v), "Mobile number must contain 10 digits.")
    .refine(
      (v) => /^[6-9]/.test(v),
      "Enter a valid Indian mobile number starting with 6, 7, 8, or 9.",
    ),
  prn: z
    .string()
    .trim()
    .regex(/^\d{12}$/, "PRN must contain exactly 12 digits."),
  department: z
    .string()
    .refine(
      (v) => departments.includes(v as (typeof departments)[number]),
      "Please select your department.",
    ),
  year: z
    .string()
    .refine(
      (v) => years.includes(v as (typeof years)[number]),
      "Please select your academic year.",
    ),
  note: z.string().trim().max(500, "Keep your note under 500 characters."),
  consent: z
    .boolean()
    .refine((v) => v, "Please accept the demo registration terms."),
});
export type RegistrationInput = z.input<typeof registrationSchema>;
export const eventSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(5, "Use at least 5 characters for the event title.")
      .max(80, "Keep the title under 80 characters."),
    category: z.enum(categories, { error: "Please select a category." }),
    description: z
      .string()
      .trim()
      .min(40, "Describe your event in at least 40 characters.")
      .max(5000, "Keep the description under 5,000 characters."),
    start: z
      .string()
      .refine(
        (v) => Number.isFinite(Date.parse(v)) && Date.parse(v) > Date.now(),
        "Choose a start date and time in the future.",
      ),
    end: z
      .string()
      .refine(
        (v) => Number.isFinite(Date.parse(v)),
        "Choose a valid end date and time.",
      ),
    venue: z
      .string()
      .trim()
      .min(3, "Please enter a venue (at least 3 characters).")
      .max(120),
    organizer: z
      .string()
      .trim()
      .min(2, "Please enter an organizer name.")
      .max(80),
    capacity: z
      .string()
      .regex(/^[1-9]\d*$/, "Capacity must be a positive whole number.")
      .transform(Number)
      .refine((v) => v <= 10000, "Capacity cannot exceed 10,000."),
    theme: z.enum(themes),
  })
  .refine((v) => Date.parse(v.end) > Date.parse(v.start), {
    message: "End time must be after the start time.",
    path: ["end"],
  });
export type EventFormValues = z.input<typeof eventSchema>;
