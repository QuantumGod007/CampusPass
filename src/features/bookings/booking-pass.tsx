import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  MapPin,
  Printer,
  Ticket,
} from "lucide-react";
import { useStore } from "../../app/store";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/empty-state";
import { Poster } from "../events/event-card";
import { eventDate, eventTime, readableDate } from "../../lib/utils";
import { eventCalendarDates } from "../../lib/calendar";
import { CalendarActions } from "./calendar-actions";
export function BookingPass() {
  const { bookingId } = useParams();
  const { state } = useStore();
  const booking = state.registrations.find((r) => r.id === bookingId);
  const event = state.events.find((e) => e.id === booking?.eventId);
  if (!booking || !event)
    return (
      <div className="container page">
        <EmptyState
          title="This pass isn’t in your browser."
          description="Demo passes are saved only where they were created. The link may be incomplete, or your demo data may have been reset."
        />
      </div>
    );
  const cancelled = booking.status === "cancelled";
  const calendarDates = eventCalendarDates(event);
  return (
    <div className="container page pass-page">
      <Link className="back-link no-print" to="/bookings">
        <ArrowLeft size={16} />
        My bookings
      </Link>
      <div className="confirmation-heading no-print">
        <span
          className={`confirmation-icon ${cancelled ? "cancelled-icon" : ""}`}
        >
          {cancelled ? <Ticket size={25} /> : <Check size={27} />}
        </span>
        <p className="eyebrow muted">
          {cancelled ? "LOCAL DEMO RECORD" : "GOOD PLANS, CONFIRMED"}
        </p>
        <h1>{cancelled ? "This plan has changed." : "You’re on the list."}</h1>
        <p className="muted">
          {cancelled
            ? "This registration has been cancelled. There’s always a next time."
            : `See you there, ${booking.fullName.split(" ")[0]}. Your demo pass is ready.`}
        </p>
      </div>
      <article className={`digital-pass ${cancelled ? "pass-cancelled" : ""}`}>
        <div className="pass-artwork">
          <Poster event={event} />
        </div>
        <div className="pass-content">
          <span className="pass-artwork-label">
            CAMPUSPASS / THE GOOD KIND OF PLANS
          </span>
          <div className="pass-status">
            <span
              className={`status-label ${cancelled ? "status-cancelled" : ""}`}
            >
              {cancelled ? "CANCELLED" : "CONFIRMED · DEMO PASS"}
            </span>
            <Ticket size={23} />
          </div>
          <h2>{event.title}</h2>
          <div className="pass-facts">
            <p>
              <CalendarDays size={15} />
              <span>
                {calendarDates
                  ? `${eventDate(event.start)} · ${eventTime(event.start)}`
                  : "Event time unavailable"}
              </span>
            </p>
            <p>
              <MapPin size={15} />
              <span>{event.venue}</span>
            </p>
          </div>
          <div className="pass-student">
            <div>
              <span className="eyebrow muted">PASS HOLDER</span>
              <strong>{booking.fullName}</strong>
              <span>
                {booking.department} · {booking.year}
              </span>
            </div>
            <div>
              <span className="eyebrow muted">STUDENT PRN</span>
              <strong>{booking.prn}</strong>
              <span>Registered {readableDate(booking.createdAt)}</span>
            </div>
          </div>
          <div className="pass-tear">
            <span />
            <span />
          </div>
          <div className="pass-id">
            <div>
              <span className="eyebrow muted">BOOKING REFERENCE</span>
              <code>{booking.id}</code>
            </div>
            <div className="ticket-bars" aria-hidden="true">
              {Array.from({ length: 38 }, (_, i) => (
                <i key={i} style={{ width: i % 3 === 0 ? 3 : 1 }} />
              ))}
            </div>
          </div>
          <p className="pass-disclaimer">
            Demonstration only · Not a real reservation or valid entry ticket.
            <br />
            Stored locally in this browser. No email has been sent.
          </p>
        </div>
      </article>
      <div className="pass-actions no-print">
        <CalendarActions
          event={event}
          disabled={cancelled}
          unavailableDescriptionId={
            !cancelled && !calendarDates ? "calendar-unavailable" : undefined
          }
        />
        <Button
          variant="outline"
          onClick={() => window.print()}
          disabled={cancelled}
        >
          <Printer size={16} />
          Print demo pass
        </Button>
        <Button asChild>
          <Link to="/bookings">
            View my bookings <ArrowRight size={16} />
          </Link>
        </Button>
      </div>
      {!cancelled && !calendarDates && (
        <p id="calendar-unavailable" className="muted small no-print">
          Calendar export is unavailable because the event dates are missing or
          invalid.
        </p>
      )}
      <Link className="text-link no-print" to="/">
        Keep exploring <ArrowUpRightIcon />
      </Link>
    </div>
  );
}
function ArrowUpRightIcon() {
  return <ArrowRight size={14} style={{ transform: "rotate(-45deg)" }} />;
}
