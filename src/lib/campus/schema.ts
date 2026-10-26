import { z } from "zod";
import { Constants } from "../../types/database";
import { eventSchema } from "../schemas";
export const accessSchema = z.object({
  institution_id: z.uuid().nullable(),
  institution_name: z.string().nullable(),
  role: z.enum(["student", "organizer"]).nullable(),
  profile_complete: z.boolean(),
});
export const liveEventSchema = z.object({
  id: z.uuid(),
  institution_id: z.uuid(),
  organizer_id: z.uuid(),
  title: z.string(),
  description: z.string(),
  category: z.enum(Constants.public.Enums.event_category),
  venue: z.string(),
  starts_at: z.iso.datetime({ offset: true }),
  ends_at: z.iso.datetime({ offset: true }),
  capacity: z.number().int().positive(),
  status: z.enum(Constants.public.Enums.event_status),
  theme: z.enum(Constants.public.Enums.poster_theme),
  registration_open: z.boolean(),
  editable: z.boolean(),
  revision: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
  confirmed_count: z.number().int().nonnegative(),
  available_seats: z.number().int().nonnegative(),
});
export const bookingSchema = z.object({
  id: z.uuid(),
  event_id: z.uuid(),
  student_id: z.uuid(),
  status: z.enum(Constants.public.Enums.booking_status),
  reference: z.string().startsWith("CP-"),
  created_at: z.string(),
  cancelled_at: z.string().nullable(),
  cancellation_reason: z.enum(["student", "event_cancelled"]).nullable(),
});
export const bookingDetailSchema = bookingSchema.extend({
  event: liveEventSchema,
});
export const attendeeSchema = z.object({
  booking_id: z.uuid(),
  reference: z.string(),
  status: z.enum(Constants.public.Enums.booking_status),
  created_at: z.string(),
  display_name: z.string(),
  department: z.string().nullable(),
  academic_year: z.string().nullable(),
});
export const liveEventFormSchema = z
  .object({
    title: eventSchema.shape.title,
    description: eventSchema.shape.description,
    category: eventSchema.shape.category,
    venue: eventSchema.shape.venue,
    start: eventSchema.shape.start,
    end: eventSchema.shape.end,
    capacity: eventSchema.shape.capacity,
    theme: eventSchema.shape.theme,
  })
  .refine((value) => Date.parse(value.end) > Date.parse(value.start), {
    path: ["end"],
    message: "End time must be after the start time.",
  });
export type LiveEvent = z.infer<typeof liveEventSchema>;
export type LiveBooking = z.infer<typeof bookingDetailSchema>;
export type CampusAccess = z.infer<typeof accessSchema>;
export type Attendee = z.infer<typeof attendeeSchema>;
export type LiveEventFormValues = z.input<typeof liveEventFormSchema>;
export const admissionTokenSchema = z.string().regex(/^cp1_[0-9a-f]{64}$/);
export const passStatusSchema = z
  .object({
    booking_id: z.uuid(),
    checked_in_at: z.iso.datetime({ offset: true }).nullable(),
    server_now: z.iso.datetime({ offset: true }),
    opens_at: z.iso.datetime({ offset: true }),
    closes_at: z.iso.datetime({ offset: true }),
    eligible: z.boolean(),
  })
  .strict();
export const issuedPassSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      outcome: z.literal("issued"),
      booking_id: z.uuid(),
      token: admissionTokenSchema,
      expires_at: z.iso.datetime({ offset: true }),
      server_now: z.iso.datetime({ offset: true }),
    })
    .strict(),
  z.object({ outcome: z.literal("rate_limited") }).strict(),
]);
export const scanResultSchema = z
  .object({
    outcome: z.enum([
      "admitted",
      "already_checked_in",
      "expired",
      "invalid",
      "cancelled",
      "ineligible",
      "outside_window",
      "rate_limited",
    ]),
    checked_in_at: z.iso.datetime({ offset: true }).nullable().optional(),
    reference: z.string().nullable().optional(),
  })
  .strict();
export const checkinsSchema = z
  .object({
    event_id: z.uuid(),
    confirmed_count: z.number().int().nonnegative(),
    admitted_count: z.number().int().nonnegative(),
    server_now: z.iso.datetime({ offset: true }),
    opens_at: z.iso.datetime({ offset: true }),
    closes_at: z.iso.datetime({ offset: true }),
    event_status: z.enum(Constants.public.Enums.event_status),
    history: z
      .array(
        z
          .object({
            checked_in_at: z.iso.datetime({ offset: true }),
            reference: z.string(),
            display_name: z.string(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();
export type IssuedPass = Extract<
  z.infer<typeof issuedPassSchema>,
  { outcome: "issued" }
>;
export type ScanResult = z.infer<typeof scanResultSchema>;
