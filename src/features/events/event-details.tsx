import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Clock3,
  Copy,
  MapPin,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useStore } from "../../app/store";
import { useToast } from "../../components/toast";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/empty-state";
import { Availability, BookmarkButton, EventCard, Poster } from "./event-card";
import { eventDate, eventTime, readableDate } from "../../lib/utils";
import { registrationState, seatsLeft } from "../../lib/domain";
export function EventDetails() {
  const { eventId } = useParams();
  const { state, now } = useStore();
  const toast = useToast();
  const event = state.events.find((e) => e.id === eventId);
  if (!event)
    return (
      <div className="container page">
        <EmptyState
          title="This event wandered off."
          description="It may have been removed or the link is incomplete. There is plenty more happening on campus."
        />
      </div>
    );
  const status = registrationState(event, state.registrations, now);
  const left = seatsLeft(event, state.registrations);
  const related = state.events
    .filter((e) => e.id !== event.id && Date.parse(e.start) > now)
    .sort(
      (a, b) =>
        Number(b.category === event.category) -
        Number(a.category === event.category),
    )
    .slice(0, 3);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("Event link copied. Bring a friend along.");
    } catch {
      toast(
        "Copy is unavailable. You can copy the URL from your address bar.",
        true,
      );
    }
  };
  return (
    <div className="container page detail-page">
      <Link className="back-link" to="/">
        <ArrowLeft size={16} />
        Back to Discover
      </Link>
      <div className="detail-grid">
        <div className="detail-main">
          <div className="detail-cover">
            <Poster event={event} />
            <BookmarkButton event={event} />
          </div>
          <div className="detail-title">
            <span className="category-tag static-tag">{event.category}</span>
            <span className="muted small">Hosted by {event.organizer}</span>
            <h1>{event.title}</h1>
            <p className="muted">
              A new experience. A few new faces. A reason to show up.
            </p>
          </div>
          <section className="detail-section">
            <h2>Here’s the plan.</h2>
            <p>{event.description}</p>
          </section>
          <section className="detail-section">
            <h2>A little structure. A lot of possibility.</h2>
            <ol className="agenda">
              {event.agenda.map((item, i) => (
                <li key={item.time}>
                  <span className="agenda-number">0{i + 1}</span>
                  <div>
                    <span className="eyebrow muted">{item.time}</span>
                    <p>{item.title}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section className="detail-section details-note">
            <ShieldCheck size={20} />
            <div>
              <h3>A few things to know</h3>
              <p>
                Free to attend. Bring your student ID and arrive 15 minutes
                early. This fictional event uses local demo registrations; your
                pass does not reserve a real seat.
              </p>
            </div>
          </section>
        </div>
        <aside className="registration-card">
          <span className="eyebrow muted">YOUR NEXT CAMPUS STORY</span>
          <h2>Be part of it.</h2>
          <div className="event-facts">
            <div>
              <CalendarDays size={20} />
              <div>
                <strong>{readableDate(event.start)}</strong>
                <span>{eventDate(event.start).split(",")[0]}</span>
              </div>
            </div>
            <div>
              <Clock3 size={20} />
              <div>
                <strong>
                  {eventTime(event.start)} – {eventTime(event.end)}
                </strong>
                <span>
                  {readableDate(event.end) !== readableDate(event.start)
                    ? `Ends ${readableDate(event.end)}`
                    : "Times shown in your device’s time zone"}
                </span>
              </div>
            </div>
            <div>
              <MapPin size={20} />
              <div>
                <strong>{event.venue}</strong>
                <span>On campus · In person</span>
              </div>
            </div>
            <div>
              <Users size={20} />
              <div>
                <strong>{event.organizer}</strong>
                <span>Your event hosts</span>
              </div>
            </div>
          </div>
          <div className="seat-summary">
            <Availability event={event} />
            <span>{event.capacity} capacity</span>
          </div>
          <div className="capacity-track">
            <span
              style={{
                width: `${Math.min(100, ((event.capacity - left) / event.capacity) * 100)}%`,
              }}
            />
          </div>
          <div className="price-row">
            <strong>Free</strong>
            <span>No fees. Just show up.</span>
          </div>
          {status === "open" ? (
            <Button asChild className="full-width">
              <Link to={`/events/${event.id}/register`}>
                Register for this event <ArrowRight size={17} />
              </Link>
            </Button>
          ) : (
            <Button className="full-width" disabled>
              {status === "full"
                ? "This event is fully booked"
                : "Registration closed"}
            </Button>
          )}
          <Button variant="ghost" className="full-width" onClick={copy}>
            <Copy size={15} />
            Copy event link
          </Button>
          <p className="local-note">
            <ShieldCheck size={14} />
            Demo booking · Stored in this browser only
          </p>
        </aside>
      </div>
      {related.length > 0 && (
        <section className="related-section">
          <div className="section-heading">
            <h2>Keep the possibilities open.</h2>
            <Link className="text-link" to="/">
              All events
              <ArrowRight size={15} />
            </Link>
          </div>
          <div className="events-grid">
            {related.map((e) => (
              <EventCard event={e} key={e.id} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
