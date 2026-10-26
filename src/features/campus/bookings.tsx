import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { EmptyState } from "../../components/empty-state";
import { useToast } from "../../components/toast";
import { Poster } from "../events/event-card";
import type { LiveBooking } from "../../lib/campus/schema";
import { useCampusAccess, useCampusAction, useCampusBookings } from "./hooks";
import {
  ActionError,
  EventFacts,
  focusCampusHeading,
  QueryState,
} from "./shared";
export function CampusBookings() {
  return <BookingWorkspace />;
}
export function CampusBookingDetails() {
  const { bookingId = "" } = useParams();
  return <BookingWorkspace id={bookingId} />;
}
function BookingWorkspace({ id }: { id?: string }) {
  const resource = useCampusBookings();
  const access = useCampusAccess();
  const action = useCampusAction();
  const [tab, setTab] = useState<"upcoming" | "past" | "cancelled">("upcoming");
  const [cancel, setCancel] = useState<LiveBooking | null>(null);
  const toast = useToast();
  const matches = (booking: LiveBooking, target: typeof tab) =>
    target === "cancelled"
      ? booking.status === "cancelled"
      : booking.status === "confirmed" &&
        (target === "upcoming"
          ? booking.event.registration_open
          : !booking.event.registration_open);
  const results = resource.data?.filter((booking) =>
    id ? booking.id === id : matches(booking, tab),
  );
  async function confirmCancel() {
    if (!cancel) return;
    try {
      await action.run((repo, owner, signal) =>
        repo.cancel(owner, cancel.id, signal),
      );
      setCancel(null);
      toast("Registration cancelled. Its seat is available again.");
      resource.reload();
      focusCampusHeading();
    } catch {
      /* The actionable error remains in the confirmation dialog. */
    }
  }
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow muted">ACCOUNT-BACKED REGISTRATIONS</p>
        <h1 tabIndex={-1}>
          {id ? "Your registration" : "My campus bookings"}
          <span className="blue-dot">.</span>
        </h1>
        <p className="muted">
          Your own persistent registration history. No demo records are
          included.
        </p>
      </div>
      <div className="page-toolbar campus-toolbar">
        {id ? (
          <Link className="text-link" to="/campus/bookings">
            All my campus bookings
          </Link>
        ) : (
          <div className="tabs" aria-label="Campus booking status">
            {(["upcoming", "past", "cancelled"] as const).map((value) => (
              <button
                key={value}
                className={tab === value ? "active" : ""}
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
              >
                {value === "upcoming"
                  ? "Upcoming"
                  : value === "past"
                    ? "Past events"
                    : "Cancelled"}
                <span>
                  {resource.data?.filter((booking) => matches(booking, value))
                    .length || 0}
                </span>
              </button>
            ))}
          </div>
        )}
        <Button variant="outline" onClick={resource.reload}>
          Refresh bookings
        </Button>
      </div>
      {resource.status !== "ready" ? (
        <QueryState resource={resource} />
      ) : results?.length ? (
        <div className="booking-list">
          {results.map((booking) => (
            <article className="booking-row campus-booking" key={booking.id}>
              <Link
                to={`/campus/events/${booking.event_id}`}
                aria-label={`View ${booking.event.title}`}
              >
                <Poster event={booking.event} />
              </Link>
              <div className="booking-row-details">
                <span
                  className={`status-label ${booking.status === "cancelled" ? "status-cancelled" : ""}`}
                >
                  {booking.status.toUpperCase()}
                </span>
                <h2>
                  <Link to={`/campus/events/${booking.event_id}`}>
                    {booking.event.title}
                  </Link>
                </h2>
                <EventFacts event={booking.event} />
                <p className="campus-reference">
                  <span>Booking reference</span>
                  <code>{booking.reference}</code>
                </p>
                {booking.cancellation_reason === "event_cancelled" && (
                  <p className="small muted">
                    The organizer cancelled this event.
                  </p>
                )}
              </div>
              <div className="booking-actions">
                {!id && (
                  <Button asChild variant="outline">
                    <Link to={`/campus/bookings/${booking.id}`}>
                      View booking
                    </Link>
                  </Button>
                )}
                {booking.status === "confirmed" &&
                  booking.event.registration_open &&
                  access.data?.institution_id ===
                    booking.event.institution_id && (
                    <button
                      className="cancel-link"
                      disabled={action.busy}
                      onClick={() => setCancel(booking)}
                    >
                      Cancel registration
                    </button>
                  )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            id ? "This booking isn’t available." : `No ${tab} campus bookings.`
          }
          description={
            id
              ? "Only your own bookings can be opened."
              : "Register for a published institution event to see your booking here."
          }
        />
      )}
      <p className="subtle-notice">
        Cancellation is allowed until the event starts and requires active
        membership. Rebooking creates a new reference if a seat remains.
        References do not verify admission.
      </p>
      <Dialog
        open={!!cancel}
        onOpenChange={(open) => {
          if (!open && !action.busy) setCancel(null);
        }}
        title="Cancel your campus registration?"
        description={`Your seat for ${cancel?.event.title || "this event"} will be released once. The cancelled record stays in your history.`}
      >
        <ActionError error={action.error} />
        <div className="dialog-actions">
          <Button
            variant="outline"
            disabled={action.busy}
            onClick={() => setCancel(null)}
          >
            Keep registration
          </Button>
          <Button
            variant="danger"
            disabled={action.busy}
            onClick={() => void confirmCancel()}
          >
            {action.busy ? "Cancelling…" : "Confirm cancellation"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
