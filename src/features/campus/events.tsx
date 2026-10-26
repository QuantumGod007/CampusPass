import { CampusWaitlist } from "./waitlists";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Search } from "lucide-react";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/empty-state";
import { Poster } from "../events/event-card";
import { useToast } from "../../components/toast";
import {
  useCampusAccess,
  useCampusAction,
  useCampusBookings,
  useCampusEvent,
  useCampusEvents,
} from "./hooks";
import {
  ActionError,
  Availability,
  EventFacts,
  MembershipNotice,
  QueryState,
} from "./shared";
export function CampusDiscover() {
  const access = useCampusAccess();
  const events = useCampusEvents();
  const [query, setQuery] = useState("");
  if (access.status !== "ready" || !access.data)
    return <QueryState resource={access} />;
  if (!access.data.institution_id)
    return <MembershipNotice access={access.data} />;
  const filtered = events.data?.filter((event) =>
    `${event.title} ${event.venue} ${event.category}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow muted">{access.data.institution_name}</p>
        <h1 tabIndex={-1}>
          Your campus, together<span className="blue-dot">.</span>
        </h1>
        <p className="muted">
          Published events and genuine shared seat availability.
        </p>
      </div>
      <div className="page-toolbar campus-toolbar">
        <div className="search-box">
          <Search size={18} />
          <label className="sr-only" htmlFor="campus-search">
            Search campus events
          </label>
          <input
            id="campus-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search events or venues…"
          />
        </div>
        <Button variant="outline" onClick={events.reload}>
          Refresh availability
        </Button>
      </div>
      {events.status !== "ready" ? (
        <QueryState resource={events} />
      ) : filtered?.length ? (
        <div className="events-grid">
          {filtered.map((event) => (
            <article
              className="event-card"
              key={event.id}
              data-testid="live-event-card"
            >
              <div className="card-image">
                <Link
                  to={`/campus/events/${event.id}`}
                  aria-label={`View ${event.title}`}
                >
                  <Poster event={event} />
                </Link>
                <span className="category-tag">{event.category}</span>
              </div>
              <div className="card-content">
                <h2>
                  <Link to={`/campus/events/${event.id}`}>
                    {event.title} <ArrowUpRight size={18} />
                  </Link>
                </h2>
                <EventFacts event={event} />
                <Availability event={event} />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            query
              ? "No matching campus events."
              : "No published campus events yet."
          }
          description={
            query
              ? "Try another title, venue or category."
              : "Your institution’s organizers will publish upcoming events here."
          }
        />
      )}
    </>
  );
}
export function CampusEventDetails() {
  const { eventId = "" } = useParams();
  const resource = useCampusEvent(eventId);
  const access = useCampusAccess();
  const bookings = useCampusBookings();
  const action = useCampusAction();
  const request = useRef<{ event: string; id: string } | null>(null);
  const navigate = useNavigate();
  const toast = useToast();
  const event = resource.data;
  const own = bookings.data?.find(
    (booking) => booking.event_id === eventId && booking.status === "confirmed",
  );
  if (resource.status !== "ready") return <QueryState resource={resource} />;
  if (!event)
    return (
      <EmptyState
        title="This event isn’t available."
        description="It may be private, removed or outside your institution."
      />
    );
  const bookable = event.registration_open && event.available_seats > 0;
  async function book() {
    if (request.current?.event !== eventId)
      request.current = { event: eventId, id: crypto.randomUUID() };
    const requestId = request.current.id;
    try {
      const booking = await action.run((repo, owner, signal) =>
        repo.book(owner, eventId, requestId, signal),
      );
      toast(
        booking.status === "confirmed"
          ? "Your registration is confirmed."
          : "This request refers to a cancelled booking.",
      );
      navigate(`/campus/bookings/${booking.id}`);
    } catch {
      resource.reload();
    }
  }
  return (
    <>
      <Link className="back-link" to="/campus">
        <ArrowLeft size={16} />
        Back to campus events
      </Link>
      <div className="detail-layout">
        <div>
          <Poster event={event} />
          <div className="page-heading">
            <p className="eyebrow muted">{event.category}</p>
            <h1 tabIndex={-1}>{event.title}</h1>
          </div>
          <section className="detail-section">
            <h2>Here’s the plan.</h2>
            <p className="campus-description">{event.description}</p>
          </section>
        </div>
        <aside className="registration-card">
          <h2>Be part of it.</h2>
          <EventFacts event={event} />
          <div className="seat-summary">
            <Availability event={event} />
            <span>
              {event.confirmed_count} / {event.capacity} confirmed
            </span>
          </div>
          <Button
            variant="outline"
            className="full-width"
            onClick={() => {
              resource.reload();
              bookings.reload();
              access.reload();
            }}
          >
            Refresh availability
          </Button>
          {access.status !== "ready" ? (
            <QueryState resource={access} />
          ) : !access.data?.institution_id ? (
            <MembershipNotice access={access.data!} />
          ) : !access.data.profile_complete ? (
            <Button asChild>
              <Link to="/account/profile">Complete student profile</Link>
            </Button>
          ) : bookings.status !== "ready" ? (
            <QueryState resource={bookings} />
          ) : own ? (
            <Button asChild className="full-width">
              <Link to={`/campus/bookings/${own.id}`}>
                View your registration
              </Link>
            </Button>
          ) : (
            <Button
              className="full-width"
              disabled={action.busy || !bookable}
              onClick={() => void book()}
            >
              {action.busy
                ? "Confirming registration…"
                : bookable
                  ? "Confirm registration"
                  : event.status === "cancelled"
                    ? "Event cancelled"
                    : event.available_seats === 0
                      ? "This event is fully booked"
                      : "Registration closed"}
            </Button>
          )}
          {access.status === "ready" &&
            access.data?.institution_id === event.institution_id &&
            access.data.profile_complete &&
            bookings.status === "ready" &&
            !own && (
              <CampusWaitlist
                event={event}
                onChanged={() => {
                  resource.reload();
                  bookings.reload();
                }}
              />
            )}
          <ActionError error={action.error} />
          <p className="local-note">
            Identity comes from your account profile. Capacity is allocated
            atomically by the server. A displayed seat can be taken before you
            register.
          </p>
          <p className="small muted">
            Free registration. A booking reference is not a security-verifiable
            admission ticket.
          </p>
        </aside>
      </div>
    </>
  );
}
