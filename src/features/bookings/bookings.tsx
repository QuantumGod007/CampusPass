import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  MapPin,
  Search,
  Ticket,
  X,
} from "lucide-react";
import { useStore } from "../../app/store";
import { EmptyState } from "../../components/empty-state";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ui/dialog";
import { useToast } from "../../components/toast";
import { Poster } from "../events/event-card";
import { eventDate, eventTime } from "../../lib/utils";
type Tab = "upcoming" | "past" | "cancelled";
export function Bookings() {
  const { state, now, cancel } = useStore();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const toast = useToast();
  const bookings = useMemo(
    () =>
      state.registrations.flatMap((booking) => {
        const event = state.events.find((e) => e.id === booking.eventId);
        return event ? [{ booking, event }] : [];
      }),
    [state],
  );
  const inTab = (item: (typeof bookings)[number], current: Tab) =>
    current === "cancelled"
      ? item.booking.status === "cancelled"
      : item.booking.status === "confirmed" &&
        (current === "upcoming"
          ? Date.parse(item.event.start) > now
          : Date.parse(item.event.start) <= now);
  const results = bookings
    .filter(
      (item) =>
        inTab(item, tab) &&
        `${item.event.title} ${item.booking.fullName} ${item.booking.id}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    )
    .sort((a, b) => Date.parse(a.event.start) - Date.parse(b.event.start));
  const cancellation = bookings.find((item) => item.booking.id === cancelId);
  return (
    <div className="container page bookings-page">
      <div className="page-heading">
        <p className="eyebrow muted">
          YOUR CALENDAR, A LITTLE MORE INTERESTING
        </p>
        <h1>
          Good plans live here<span className="blue-dot">.</span>
        </h1>
        <p className="muted">
          Your passes, your people, your next campus story.
        </p>
      </div>
      <div className="page-toolbar">
        <div className="tabs" aria-label="Booking status">
          {(["upcoming", "past", "cancelled"] as const).map((t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              aria-pressed={tab === t}
              onClick={() => setTab(t)}
            >
              {t === "upcoming"
                ? "Upcoming"
                : t === "past"
                  ? "Past events"
                  : "Cancelled"}
              <span>{bookings.filter((item) => inTab(item, t)).length}</span>
            </button>
          ))}
        </div>
        <div className="search-box compact-search">
          <Search size={17} />
          <label className="sr-only" htmlFor="booking-search">
            Search bookings
          </label>
          <input
            id="booking-search"
            ref={searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a booking…"
          />
          {query && (
            <button
              className="icon-button"
              aria-label="Clear booking search"
              onClick={() => {
                setQuery("");
                searchInput.current?.focus();
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>
      {results.length ? (
        <div className="booking-list">
          {results.map(({ booking, event }) => (
            <article key={booking.id} className="booking-row">
              <Link
                to={`/events/${event.id}`}
                aria-label={`View ${event.title}`}
              >
                <Poster event={event} />
              </Link>
              <div className="booking-row-details">
                <span
                  className={`status-label ${booking.status === "cancelled" ? "status-cancelled" : ""}`}
                >
                  {booking.status === "cancelled"
                    ? "CANCELLED"
                    : tab === "past"
                      ? "PAST EVENT"
                      : "CONFIRMED"}
                </span>
                <h2>
                  <Link to={`/events/${event.id}`}>{event.title}</Link>
                </h2>
                <p>
                  <CalendarDays size={14} />
                  {eventDate(event.start)} · {eventTime(event.start)}
                </p>
                <p>
                  <MapPin size={14} />
                  {event.venue}
                </p>
                <span className="booking-holder">
                  For {booking.fullName} · PRN {booking.prn}
                </span>
              </div>
              <div className="booking-actions">
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/bookings/${booking.id}`}>
                    <Ticket size={15} />
                    {booking.status === "cancelled"
                      ? "View record"
                      : "View event pass"}
                    <ArrowUpRight size={14} />
                  </Link>
                </Button>
                {booking.status === "confirmed" && tab === "upcoming" && (
                  <button
                    className="cancel-link"
                    onClick={() => setCancelId(booking.id)}
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
            query
              ? "No plans by that name."
              : tab === "cancelled"
                ? "No cancelled plans."
                : tab === "past"
                  ? "Memories are on their way."
                  : "Your next story is unwritten."
          }
          description={
            query
              ? "Try a different event name, student name, or booking reference."
              : tab === "upcoming"
                ? "Find something that makes you curious. Your first campus pass is just a few clicks away."
                : tab === "past"
                  ? "After your events begin, your registrations will move here."
                  : "When you cancel a registration, the record will appear here."
          }
          action="Clear search"
          onAction={query ? () => setQuery("") : undefined}
        />
      )}
      <div className="subtle-notice">
        <Ticket size={17} />
        <p>
          These are local demonstration bookings, saved only in this browser.
          They do not reserve real event seats.
        </p>
      </div>
      <ConfirmDialog
        open={!!cancelId}
        onOpenChange={(open) => {
          if (!open) setCancelId(null);
        }}
        title="Can’t make it this time?"
        description={`Cancel your demo registration for ${cancellation?.event.title || "this event"}? Your locally reserved spot will become available again. You can register again if there’s room.`}
        confirmLabel="Cancel registration"
        onConfirm={() => {
          if (!cancelId) return;
          try {
            cancel(cancelId);
            toast("Registration cancelled. Your spot is available again.");
          } catch (e) {
            toast(
              e instanceof Error ? e.message : "Could not cancel registration.",
              true,
            );
          }
          setCancelId(null);
        }}
      />
    </div>
  );
}
