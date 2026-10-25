import type {
  LiveEvent,
  LiveBooking,
  CampusAccess,
} from "../lib/campus/schema";
import { authSession } from "./auth-fixtures";
export const eventFixture = (): LiveEvent => ({
  id: "71000000-0000-4000-8000-000000000001",
  institution_id: "73000000-0000-4000-8000-000000000001",
  organizer_id: authSession().user.id,
  title: "Shared Campus Workshop",
  description:
    "A useful shared campus workshop with a sufficiently detailed description.",
  category: "Technology",
  venue: "Main Campus Hall",
  starts_at: "2030-11-15T10:00:00+00:00",
  ends_at: "2030-11-15T12:00:00+00:00",
  capacity: 2,
  status: "published",
  theme: "build",
  revision: 2,
  created_at: "2026-10-26T10:00:00+00:00",
  updated_at: "2026-10-26T10:00:00+00:00",
  confirmed_count: 1,
  available_seats: 1,
  registration_open: true,
  editable: true,
});
export const bookingFixture = (owner = authSession().user.id): LiveBooking => ({
  id: "72000000-0000-4000-8000-000000000001",
  event_id: eventFixture().id,
  student_id: owner,
  status: "confirmed",
  reference: "CP-72000000-0000-4000-8000-000000000001",
  created_at: "2026-10-26T10:00:00+00:00",
  cancelled_at: null,
  cancellation_reason: null,
  event: eventFixture(),
});
export const accessFixture: CampusAccess = {
  institution_id: eventFixture().institution_id,
  institution_name: "Test Campus",
  role: "student",
  profile_complete: true,
};
