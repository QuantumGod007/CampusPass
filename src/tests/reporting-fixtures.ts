import type {
  EventAnalytics,
  ReportHeader,
  ReportPage,
} from "../lib/campus/reporting-schema";
export const reportingEventId = "91000000-0000-4000-8000-000000000001";
export const reportingBookingId = "92000000-0000-4000-8000-000000000001";
export const analyticsFixture = (): EventAnalytics => ({
  as_of: "2030-11-16T12:00:00Z",
  event: {
    id: reportingEventId,
    title: "Shared Attendance Workshop",
    institution_name: "Test Campus",
    venue: "Main Hall",
    starts_at: "2030-11-15T10:00:00Z",
    ends_at: "2030-11-15T12:00:00Z",
    capacity: 2,
    status: "published",
  },
  lifecycle: "ended",
  metrics: {
    capacity: 2,
    booking_records: 3,
    confirmed: 2,
    cancelled: 1,
    active_waitlist: 0,
    promotions: 1,
    total_checkins: 1,
    confirmed_checked_in: 1,
    confirmed_not_checked_in: 1,
    checkin_percentage: 50,
    remaining_seats: 0,
  },
  timeline: [
    {
      starts_at: "2030-11-15T10:01:00Z",
      ends_at: "2030-11-15T10:01:00Z",
      count: 1,
    },
  ],
});
export const headerFixture = (): ReportHeader => ({
  id: "93000000-0000-4000-8000-000000000001",
  event_id: reportingEventId,
  created_at: "2030-11-16T12:00:00Z",
  expires_at: "2030-11-16T12:10:00Z",
  row_count: 3,
  analytics: analyticsFixture(),
});
export const pageFixture = (from = 1, to = 3): ReportPage => ({
  snapshot_id: headerFixture().id,
  event_id: reportingEventId,
  row_count: 3,
  next_after: to < 3 ? to : null,
  rows: Array.from({ length: to - from + 1 }, (_, i) => ({
    position: from + i,
    reference: `CP-report-${from + i}`,
    display_name: "Student Alpha",
    booking_status: "confirmed",
    checked_in_at: from + i === 1 ? "2030-11-15T10:01:00Z" : null,
    from_waitlist: from + i === 2,
  })),
});
export const participationFixture = () => ({
  booking_id: reportingBookingId,
  checked_in_at: "2030-11-15T10:01:00Z",
  reason: null,
  record: {
    id: "94000000-0000-4000-8000-000000000001",
    booking_id: reportingBookingId,
    event_id: reportingEventId,
    institution_name: "Test Campus",
    event_title: "Shared Attendance Workshop",
    venue: "Main Hall",
    starts_at: "2030-11-15T10:00:00Z",
    ends_at: "2030-11-15T12:00:00Z",
    display_name: "Student Alpha",
    reference: "CP-report-1",
    checked_in_at: "2030-11-15T10:01:00Z",
    issued_at: "2030-11-16T12:00:00Z",
  },
});
