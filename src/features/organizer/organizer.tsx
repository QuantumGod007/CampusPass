import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarPlus,
  Edit3,
  Eye,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import { useStore } from "../../app/store";
import type { CampusEvent } from "../../types";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { EventForm } from "./event-form";
import { eventDate } from "../../lib/utils";
import { EmptyState } from "../../components/empty-state";
import { seatsLeft } from "../../lib/domain";
export function Organizer() {
  const { state } = useStore();
  const [editing, setEditing] = useState<CampusEvent | null | undefined>(
    undefined,
  );
  const [tab, setTab] = useState<"local" | "collection">("local");
  const [viewId, setViewId] = useState<string | null>(null);
  const local = state.events.filter((e) => e.createdLocally);
  const events =
    tab === "local" ? local : state.events.filter((e) => !e.createdLocally);
  const viewed = state.events.find((e) => e.id === viewId);
  const attendees = state.registrations.filter((r) => r.eventId === viewId);
  return (
    <div className="container page organizer-page">
      <div className="page-heading organizer-heading">
        <div>
          <p className="eyebrow muted">
            WHERE “WHAT IF” BECOMES “SEE YOU THERE”
          </p>
          <h1>
            Organizer studio<span className="blue-dot">.</span>
          </h1>
          <p className="muted">A small space for your next big gathering.</p>
        </div>
        <Button onClick={() => setEditing(null)}>
          <Plus size={17} />
          Create an event
        </Button>
      </div>
      <div className="studio-note">
        <span className="studio-note-icon">
          <Sparkles size={23} />
        </span>
        <div>
          <strong>Your ideas. Your community. Your browser.</strong>
          <p>
            This is an open demo workspace. Events you create appear in your
            local Discovery feed. There’s no admin login, and nothing is
            published to other users.
          </p>
        </div>
        <span className="demo-label">DEMO STUDIO</span>
      </div>
      <div className="page-toolbar">
        <div className="tabs">
          <button
            className={tab === "local" ? "active" : ""}
            onClick={() => setTab("local")}
          >
            Your events<span>{local.length}</span>
          </button>
          <button
            className={tab === "collection" ? "active" : ""}
            onClick={() => setTab("collection")}
          >
            Campus collection<span>{state.events.length - local.length}</span>
          </button>
        </div>
        <span className="muted small">
          A good gathering starts with an idea.
        </span>
      </div>
      {events.length ? (
        <div className="table-scroll">
          <table className="organizer-table">
            <thead>
              <tr>
                <th scope="col">EVENT</th>
                <th scope="col">DATE</th>
                <th scope="col">DEMO CAPACITY</th>
                <th scope="col">LOCAL BOOKINGS</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const active = state.registrations.filter(
                  (r) => r.eventId === event.id && r.status === "confirmed",
                ).length;
                return (
                  <tr key={event.id}>
                    <td>
                      <Link to={`/events/${event.id}`} className="table-event">
                        <img src={`/posters/${event.theme}.svg`} alt="" />
                        <span>
                          <strong>{event.title}</strong>
                          <small>{event.category}</small>
                        </span>
                      </Link>
                    </td>
                    <td>{eventDate(event.start)}</td>
                    <td>
                      <strong>
                        {event.capacity - seatsLeft(event, state.registrations)}{" "}
                        <span className="muted">/ {event.capacity}</span>
                      </strong>
                      <div className="capacity-track">
                        <span
                          style={{
                            width: `${((event.capacity - seatsLeft(event, state.registrations)) / event.capacity) * 100}%`,
                          }}
                        />
                      </div>
                    </td>
                    <td>
                      <button
                        className="attendees-link"
                        onClick={() => setViewId(event.id)}
                      >
                        <Users size={14} />
                        {active} confirmed
                        <ArrowUpRight size={13} />
                      </button>
                    </td>
                    <td>
                      <div className="table-actions">
                        <Button asChild variant="ghost" size="icon">
                          <Link
                            to={`/events/${event.id}`}
                            aria-label={`View ${event.title}`}
                          >
                            <Eye size={17} />
                          </Link>
                        </Button>
                        {event.createdLocally && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${event.title}`}
                            onClick={() => setEditing(event)}
                          >
                            <Edit3 size={16} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="studio-empty">
          <span className="studio-empty-art">
            <CalendarPlus size={48} strokeWidth={1} />
          </span>
          <EmptyState
            title="Every great event starts somewhere."
            description="A workshop, a listening party, a late-night build. Give your idea a name and make a little room for people."
            action="Create your first event"
            onAction={() => setEditing(null)}
          />
        </div>
      )}
      <p className="studio-footnote">
        Initial demo reservations are fictional. Local bookings show
        registrations made in this browser.
      </p>
      <Dialog
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
        title={editing ? "A little change of plans." : "Make something happen."}
        description={
          editing
            ? "Update your local event. Existing registrations will stay attached."
            : "Create an experience worth showing up for."
        }
        className="event-form-dialog"
      >
        {editing !== undefined && (
          <EventForm
            event={editing ?? undefined}
            onSaved={() => setEditing(undefined)}
          />
        )}
      </Dialog>
      <Dialog
        open={!!viewed}
        onOpenChange={(open) => {
          if (!open) setViewId(null);
        }}
        title={viewed?.title || "Local registrations"}
        description="Registrations made in this browser. Initial demo reservations do not have student records."
      >
        <div className="attendee-summary">
          <span>
            {viewed?.initialReservations ?? 0} initial demo reservations
          </span>
          <strong>
            {attendees.filter((r) => r.status === "confirmed").length} local
            confirmed
          </strong>
        </div>
        {attendees.length ? (
          <ul className="attendee-list">
            {attendees.map((r) => (
              <li key={r.id}>
                <div>
                  <strong>{r.fullName}</strong>
                  <span>
                    PRN {r.prn} · {r.department}
                  </span>
                </div>
                <span
                  className={`status-label ${r.status === "cancelled" ? "status-cancelled" : ""}`}
                >
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted attendee-empty">
            No local registrations yet. You can try registering from the event
            page.
          </p>
        )}
      </Dialog>
    </div>
  );
}
