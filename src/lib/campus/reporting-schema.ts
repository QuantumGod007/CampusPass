import { z } from "zod";
const time = z.iso.datetime({ offset: true });
export const reportEventSchema = z
  .object({
    id: z.uuid(),
    title: z.string(),
    institution_name: z.string(),
    venue: z.string(),
    starts_at: time,
    ends_at: time,
    status: z.enum(["draft", "published", "cancelled"]),
    capacity: z.number().int().positive(),
  })
  .strict();
export const analyticsSchema = z
  .object({
    as_of: time,
    event: reportEventSchema,
    lifecycle: z.enum(["draft", "cancelled", "upcoming", "ongoing", "ended"]),
    metrics: z
      .object({
        capacity: z.number().int().positive(),
        booking_records: z.number().int().nonnegative(),
        confirmed: z.number().int().nonnegative(),
        cancelled: z.number().int().nonnegative(),
        active_waitlist: z.number().int().min(0).max(100),
        promotions: z.number().int().nonnegative(),
        total_checkins: z.number().int().nonnegative(),
        confirmed_checked_in: z.number().int().nonnegative(),
        confirmed_not_checked_in: z.number().int().nonnegative(),
        checkin_percentage: z.number().min(0).max(100),
        remaining_seats: z.number().int().nonnegative(),
      })
      .strict(),
    timeline: z
      .array(
        z
          .object({
            starts_at: time,
            ends_at: time,
            count: z.number().int().positive(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
export const reportHeaderSchema = z
  .object({
    id: z.uuid(),
    event_id: z.uuid(),
    created_at: time,
    expires_at: time,
    row_count: z.number().int().min(0).max(50000),
    analytics: analyticsSchema,
  })
  .strict();
export const reportRowSchema = z
  .object({
    position: z.number().int().min(1).max(50000),
    reference: z.string(),
    display_name: z.string(),
    booking_status: z.enum(["confirmed", "cancelled"]),
    checked_in_at: time.nullable(),
    from_waitlist: z.boolean(),
  })
  .strict();
export const reportPageSchema = z
  .object({
    snapshot_id: z.uuid(),
    event_id: z.uuid(),
    row_count: z.number().int().min(0).max(50000),
    rows: z.array(reportRowSchema).max(200),
    next_after: z.number().int().min(1).max(50000).nullable(),
  })
  .strict();
export const participationRecordSchema = z
  .object({
    id: z.uuid(),
    booking_id: z.uuid(),
    event_id: z.uuid(),
    institution_name: z.string(),
    event_title: z.string(),
    venue: z.string(),
    starts_at: time,
    ends_at: time,
    display_name: z.string(),
    reference: z.string(),
    checked_in_at: time,
    issued_at: time,
  })
  .strict();
export const participationSchema = z
  .object({
    booking_id: z.uuid(),
    checked_in_at: time.nullable(),
    reason: z
      .enum([
        "event_cancelled",
        "booking_cancelled",
        "event_not_ended",
        "not_checked_in",
      ])
      .nullable(),
    record: participationRecordSchema.nullable(),
  })
  .strict()
  .refine((value) => (value.reason === null ? !!value.record : !value.record));
export type EventAnalytics = z.infer<typeof analyticsSchema>;
export type ReportHeader = z.infer<typeof reportHeaderSchema>;
export type ReportPage = z.infer<typeof reportPageSchema>;
