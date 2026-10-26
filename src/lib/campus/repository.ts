import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "../../types/database";
import { getSupabaseClient } from "../auth/client";
import { verifiedIdentity, SessionChangedError } from "../auth/identity";
import {
  admissionTokenSchema,
  passStatusSchema,
  issuedPassSchema,
  scanResultSchema,
  checkinsSchema,
  accessSchema,
  liveEventSchema,
  bookingSchema,
  bookingDetailSchema,
  attendeeSchema,
  liveEventFormSchema,
  type LiveEventFormValues,
  type LiveEvent,
} from "./schema";
const messages: Record<string, string> = {
  "42501": "Your account session is no longer valid. Sign in again.",
  PGRST301: "Your session has expired. Sign in again.",
  PGRST303: "Your session has expired. Sign in again.",
  P1002:
    "Active institution membership is required. Contact your institution for provisioning.",
  P1003: "Complete your student profile before registering.",
  P1004: "This event has started. Registration and cancellation are closed.",
  P1005: "This event has been cancelled.",
  P1006: "The final seat has been taken. This event is now fully booked.",
  P1007:
    "Only the provisioned organizer who owns this event can perform this action.",
  P1008: "This event or booking is not available to your account.",
  P1009:
    "This request was already used for another event. Refresh and try again.",
  P1010: "This event changed in another session. Refresh before saving again.",
  P1011: "Capacity cannot be lower than the confirmed registration count.",
  P1012: "This event state cannot be changed.",
  P1020: "Entry opens 30 minutes before the event and closes at its end.",
  P1021: "This booking has already been checked in. Refresh admission status.",
  P1022: "Wait three seconds before regenerating your pass.",
  "23514": "Check the event details, dates and capacity.",
  "23502": "Complete all required event details.",
  "22P02": "Choose valid event options and dates.",
};
export class CampusError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "CampusError";
  }
}
export function campusError(error: unknown) {
  if (error instanceof CampusError) return error;
  if (error instanceof SessionChangedError)
    return new CampusError("42501", error.message);
  if (error instanceof z.ZodError)
    return new CampusError(
      "validation",
      "Check all required details and choose valid dates.",
    );
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "unavailable";
  return new CampusError(
    code,
    messages[code] ||
      "The campus service could not complete this request. Check your connection and try again.",
  );
}
interface Query extends PromiseLike<{ data: unknown; error: unknown }> {
  setHeader: (name: string, value: string) => unknown;
  abortSignal: (signal: AbortSignal) => unknown;
}
export function createCampusRepository(client: SupabaseClient<Database>) {
  async function request<T>(
    owner: string,
    query: Query,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    try {
      const { token } = await verifiedIdentity(client, owner, signal);
      query.setHeader("Authorization", `Bearer ${token}`);
      if (signal) query.abortSignal(signal);
      const { data, error } = await query;
      signal?.throwIfAborted();
      if (error) throw error;
      return schema.parse(data);
    } catch (error) {
      if (signal?.aborted) throw error;
      throw campusError(error);
    }
  }
  const ownBooking = (owner: string) =>
    bookingSchema.refine(
      (value) => value.student_id === owner,
      "Booking owner mismatch.",
    );
  const ownDetails = (owner: string) =>
    z
      .array(bookingDetailSchema)
      .refine(
        (items) => items.every((item) => item.student_id === owner),
        "Booking owner mismatch.",
      );
  function eventArgs(values: LiveEventFormValues) {
    const value = liveEventFormSchema.parse(values);
    return {
      p_title: value.title,
      p_description: value.description,
      p_category: value.category,
      p_venue: value.venue,
      p_starts_at: new Date(value.start).toISOString(),
      p_ends_at: new Date(value.end).toISOString(),
      p_capacity: value.capacity,
      p_theme: value.theme,
    };
  }
  return {
    passStatus: (owner: string, id: string, signal?: AbortSignal) =>
      request(
        owner,
        client.rpc("get_campus_pass", { p_booking_id: z.uuid().parse(id) }),
        passStatusSchema.refine((value) => value.booking_id === id),
        signal,
      ),
    issuePass: (owner: string, id: string, signal?: AbortSignal) =>
      request(
        owner,
        client.rpc("issue_campus_pass", { p_booking_id: z.uuid().parse(id) }),
        issuedPassSchema.refine(
          (value) => value.outcome !== "issued" || value.booking_id === id,
        ),
        signal,
      ),
    scanPass: (
      owner: string,
      eventId: string,
      token: string,
      signal?: AbortSignal,
    ) =>
      request(
        owner,
        client.rpc("check_in_campus_pass", {
          p_event_id: z.uuid().parse(eventId),
          p_token: admissionTokenSchema.parse(token),
        }),
        scanResultSchema,
        signal,
      ),
    checkins: (
      owner: string,
      eventId: string,
      before?: string,
      signal?: AbortSignal,
    ) =>
      request(
        owner,
        client.rpc("get_campus_checkins", {
          p_event_id: z.uuid().parse(eventId),
          ...(before ? { p_before: before } : {}),
        }),
        checkinsSchema.refine((value) => value.event_id === eventId),
        signal,
      ),
    access: (owner: string, signal?: AbortSignal) =>
      request(owner, client.rpc("get_campus_access"), accessSchema, signal),
    events: (owner: string, owned = false, signal?: AbortSignal) =>
      request(
        owner,
        client.rpc("list_campus_events", { p_owned: owned }),
        z.array(liveEventSchema),
        signal,
      ),
    event: (owner: string, id: string, signal?: AbortSignal) =>
      request(
        owner,
        client.rpc("get_campus_event", { p_event_id: id }),
        liveEventSchema.nullable(),
        signal,
      ),
    bookings: (owner: string, signal?: AbortSignal) =>
      request(
        owner,
        client.rpc("list_my_campus_bookings"),
        ownDetails(owner),
        signal,
      ),
    book: (
      owner: string,
      eventId: string,
      requestId: string,
      signal?: AbortSignal,
    ) =>
      request(
        owner,
        client.rpc("book_campus_event", {
          p_event_id: eventId,
          p_request_id: requestId,
        }),
        ownBooking(owner),
        signal,
      ),
    cancel: (owner: string, id: string, signal?: AbortSignal) =>
      request(
        owner,
        client.rpc("cancel_campus_booking", { p_booking_id: id }),
        ownBooking(owner),
        signal,
      ),
    saveEvent: (
      owner: string,
      values: LiveEventFormValues,
      event: LiveEvent | undefined,
      signal?: AbortSignal,
    ) => {
      const args = eventArgs(values);
      return request(
        owner,
        event
          ? client.rpc("save_campus_event", {
              ...args,
              p_event_id: event.id,
              p_expected_revision: event.revision,
            })
          : client.rpc("create_campus_event", args),
        liveEventSchema,
        signal,
      );
    },
    setStatus: (
      owner: string,
      event: LiveEvent,
      status: "published" | "cancelled",
      signal?: AbortSignal,
    ) =>
      request(
        owner,
        client.rpc("set_campus_event_status", {
          p_event_id: event.id,
          p_expected_revision: event.revision,
          p_status: status,
        }),
        liveEventSchema,
        signal,
      ),
    attendees: (owner: string, id: string, signal?: AbortSignal) =>
      request(
        owner,
        client.rpc("list_campus_attendees", { p_event_id: id }),
        z.array(attendeeSchema),
        signal,
      ),
  };
}
export function getCampusRepository() {
  const client = getSupabaseClient();
  if (!client)
    throw new CampusError(
      "disabled",
      "Campus accounts are not configured. The original demo remains available.",
    );
  return createCampusRepository(client);
}
export type CampusRepository = ReturnType<typeof createCampusRepository>;
