import { Link } from "react-router-dom";
import { ArrowUpRight, Bookmark, MapPin } from "lucide-react";
import type { CampusEvent } from "../../types";
import { useStore } from "../../app/store";
import { useToast } from "../../components/toast";
import { eventDate, eventTime } from "../../lib/utils";
import { registrationState, seatsLeft } from "../../lib/domain";
export function Poster({
  event,
  className = "",
}: {
  event: CampusEvent;
  className?: string;
}) {
  return (
    <img
      className={`event-poster ${className}`}
      src={`/posters/${event.theme}.svg`}
      alt={`Original poster for ${event.title}`}
      loading="lazy"
      onError={(e) => {
        if (!e.currentTarget.src.endsWith("/posters/build.svg"))
          e.currentTarget.src = "/posters/build.svg";
      }}
    />
  );
}
export function BookmarkButton({ event }: { event: CampusEvent }) {
  const { state, toggleBookmark } = useStore();
  const toast = useToast();
  const saved = state.bookmarks.some((b) => b.eventId === event.id);
  return (
    <button
      className={`bookmark-button ${saved ? "is-saved" : ""}`}
      aria-label={`${saved ? "Unsave" : "Save"} ${event.title}`}
      aria-pressed={saved}
      onClick={() => {
        const added = toggleBookmark(event.id);
        toast(
          added ? "Added to your saved events." : "Removed from saved events.",
        );
      }}
    >
      <Bookmark
        size={18}
        fill={saved ? "currentColor" : "none"}
        strokeWidth={1.7}
      />
    </button>
  );
}
export function Availability({ event }: { event: CampusEvent }) {
  const { state, now } = useStore();
  const status = registrationState(event, state.registrations, now);
  const remaining = seatsLeft(event, state.registrations);
  return (
    <span
      className={`availability ${status !== "open" ? "unavailable" : remaining <= event.capacity * 0.15 ? "almost-full" : ""}`}
    >
      <span className="availability-dot" />
      {status === "closed"
        ? "Registration closed"
        : status === "full"
          ? "Fully booked"
          : remaining <= event.capacity * 0.15
            ? `Only ${remaining} spots left`
            : `${remaining} spots available`}
    </span>
  );
}
export function EventCard({ event }: { event: CampusEvent }) {
  return (
    <article className="event-card" data-testid="event-card">
      <div className="card-image">
        <Link to={`/events/${event.id}`} aria-label={`View ${event.title}`}>
          <Poster event={event} />
        </Link>
        <span
          className={`category-tag category-${event.category.toLowerCase()}`}
        >
          {event.category}
        </span>
        <BookmarkButton event={event} />
      </div>
      <div className="card-content">
        <p className="event-date">
          {eventDate(event.start)}
          <span>·</span>
          {eventTime(event.start)}
        </p>
        <h3>
          <Link to={`/events/${event.id}`}>
            {event.title}
            <ArrowUpRight size={20} />
          </Link>
        </h3>
        <p className="event-venue">
          <MapPin size={14} />
          {event.venue}
        </p>
        <div className="card-bottom">
          <Availability event={event} />
          <span className="free-label">Free entry</span>
        </div>
      </div>
    </article>
  );
}
