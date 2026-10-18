import { Bookmark } from "lucide-react";
import { useStore } from "../../app/store";
import { EmptyState } from "../../components/empty-state";
import { EventCard } from "./event-card";
export function Saved() {
  const { state } = useStore();
  const events = state.events.filter((e) =>
    state.bookmarks.some((b) => b.eventId === e.id),
  );
  return (
    <div className="container page saved-page">
      <div className="page-heading">
        <p className="eyebrow muted">FOR YOUR “MAYBE I SHOULD” LIST</p>
        <h1>
          Worth coming back to<span className="blue-dot">.</span>
        </h1>
        <p className="muted">
          A collection of things that caught your eye. Make one a plan.
        </p>
      </div>
      <div className="saved-count">
        <Bookmark size={16} />
        {events.length} saved{" "}
        {events.length === 1 ? "experience" : "experiences"}
        <span>Just for you. Just in this browser.</span>
      </div>
      {events.length ? (
        <div className="events-grid">
          {events.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Keep a little curiosity for later."
          description="Tap the bookmark on any event to save it here. Your future self will thank you."
        />
      )}
    </div>
  );
}
