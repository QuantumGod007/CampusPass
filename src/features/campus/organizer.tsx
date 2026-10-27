import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Field, Input } from "../../components/ui/field";
import { EmptyState } from "../../components/empty-state";
import { useToast } from "../../components/toast";
import { Constants } from "../../types/database";
import { localDateInput, eventDate } from "../../lib/utils";
import {
  liveEventFormSchema,
  type LiveEventFormValues,
  type LiveEvent,
} from "../../lib/campus/schema";
import {
  useCampusAccess,
  useCampusAction,
  useCampusAttendees,
  useCampusEvents,
} from "./hooks";
import {
  ActionError,
  focusCampusHeading,
  MembershipNotice,
  QueryState,
} from "./shared";
function LiveEventForm({
  event,
  onSaved,
  onBusy,
}: {
  event?: LiveEvent;
  onSaved: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const action = useCampusAction();
  const submitLock = useRef(false);
  const toast = useToast();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<
    LiveEventFormValues,
    unknown,
    ReturnType<typeof liveEventFormSchema.parse>
  >({
    resolver: zodResolver(liveEventFormSchema),
    mode: "onTouched",
    defaultValues: event
      ? {
          title: event.title,
          description: event.description,
          category: event.category,
          venue: event.venue,
          start: localDateInput(event.starts_at),
          end: localDateInput(event.ends_at),
          capacity: String(event.capacity),
          theme: event.theme,
        }
      : {
          title: "",
          description: "",
          category: "Technology",
          venue: "",
          start: "",
          end: "",
          capacity: "",
          theme: "build",
        },
  });
  const attrs = (name: keyof LiveEventFormValues) => ({
    id: `live-${name}`,
    "aria-invalid": !!errors[name],
    "aria-required": true,
    "aria-describedby": errors[name] ? `live-${name}-error` : undefined,
  });
  async function submit(values: ReturnType<typeof liveEventFormSchema.parse>) {
    if (submitLock.current) return;
    submitLock.current = true;
    onBusy(true);
    try {
      await action.run((repo, owner, signal) =>
        repo.saveEvent(
          owner,
          { ...values, capacity: String(values.capacity) },
          event,
          signal,
        ),
      );
      toast(
        event
          ? "Event changes saved."
          : "Your draft is saved. Publish it when ready.",
      );
      onSaved();
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P1011"
      )
        setError(
          "capacity",
          { message: "Capacity cannot be lower than confirmed registrations." },
          { shouldFocus: true },
        );
    } finally {
      submitLock.current = false;
      onBusy(false);
    }
  }
  return (
    <form
      className="organizer-form"
      noValidate
      aria-busy={isSubmitting || action.busy}
      onSubmit={(e) => void handleSubmit(submit)(e)}
    >
      <fieldset
        className="campus-fieldset"
        disabled={isSubmitting || action.busy}
      >
        <legend className="sr-only">
          {event ? "Edit institution event" : "Create institution event"}
        </legend>
        <Field
          name="live-title"
          label="Event title"
          error={errors.title?.message}
        >
          <Input {...register("title")} {...attrs("title")} maxLength={80} />
        </Field>
        <Field
          name="live-description"
          label="Event description"
          error={errors.description?.message}
          hint="40–5,000 characters. No personal attendee information."
        >
          <textarea
            className="input"
            rows={4}
            {...register("description")}
            {...attrs("description")}
            maxLength={5000}
          />
        </Field>
        <div className="form-grid">
          <Field
            name="live-category"
            label="Category"
            error={errors.category?.message}
          >
            <select
              className="input"
              {...register("category")}
              {...attrs("category")}
            >
              {Constants.public.Enums.event_category.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field name="live-venue" label="Venue" error={errors.venue?.message}>
            <Input {...register("venue")} {...attrs("venue")} maxLength={120} />
          </Field>
          <Field
            name="live-start"
            label="Starts at"
            error={errors.start?.message}
          >
            <Input
              type="datetime-local"
              {...register("start")}
              {...attrs("start")}
            />
          </Field>
          <Field name="live-end" label="Ends at" error={errors.end?.message}>
            <Input
              type="datetime-local"
              {...register("end")}
              {...attrs("end")}
            />
          </Field>
          <Field
            name="live-capacity"
            label="Capacity"
            error={errors.capacity?.message}
          >
            <Input
              inputMode="numeric"
              {...register("capacity")}
              {...attrs("capacity")}
            />
          </Field>
          <Field
            name="live-theme"
            label="Poster theme"
            error={errors.theme?.message}
          >
            <select
              className="input"
              {...register("theme")}
              {...attrs("theme")}
            >
              {Constants.public.Enums.poster_theme.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
        </div>
        <p className="small muted">
          Enter dates in your device’s local time zone. They are stored in UTC.
          Institution and organizer ownership are assigned by the server.
        </p>
        <ActionError error={action.error} />
        <Button type="submit" disabled={isSubmitting || action.busy}>
          {isSubmitting || action.busy
            ? "Saving event…"
            : event
              ? "Save event changes"
              : "Save draft event"}
        </Button>
      </fieldset>
    </form>
  );
}
function Attendees({ event }: { event: LiveEvent }) {
  const resource = useCampusAttendees(event.id);
  if (resource.status !== "ready") return <QueryState resource={resource} />;
  return (
    <>
      <p className="attendee-summary">
        <strong>
          {resource.data?.filter((row) => row.status === "confirmed").length ||
            0}{" "}
          confirmed
        </strong>
        <span>
          {resource.data?.filter((row) => row.status === "cancelled").length ||
            0}{" "}
          cancelled
        </span>
      </p>
      <Button variant="outline" onClick={resource.reload}>
        Refresh attendees
      </Button>
      {resource.data?.length ? (
        <ul className="attendee-list">
          {resource.data.map((row) => (
            <li key={row.booking_id}>
              <div>
                <strong>{row.display_name}</strong>
                <span>
                  {row.department} · {row.academic_year}
                </span>
                <code className="campus-reference">{row.reference}</code>
              </div>
              <span
                className={`status-label ${row.status === "cancelled" ? "status-cancelled" : ""}`}
              >
                {row.status}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No registrations for this event yet.</p>
      )}
      <p className="small muted">
        Only your event’s minimal attendee details are returned. Emails and PRNs
        are never included.
      </p>
    </>
  );
}
export function CampusOrganizer() {
  const access = useCampusAccess();
  const events = useCampusEvents(true);
  const action = useCampusAction();
  const toast = useToast();
  const [editing, setEditing] = useState<LiveEvent | null | undefined>();
  const [formBusy, setFormBusy] = useState(false);
  const [viewing, setViewing] = useState<LiveEvent | null>(null);
  const [cancelling, setCancelling] = useState<LiveEvent | null>(null);
  if (access.status !== "ready" || !access.data)
    return <QueryState resource={access} />;
  if (access.data.role !== "organizer")
    return <MembershipNotice access={access.data} organizer />;
  async function status(event: LiveEvent, state: "published" | "cancelled") {
    try {
      await action.run((repo, owner, signal) =>
        repo.setStatus(owner, event, state, signal),
      );
      toast(
        state === "published"
          ? "Event published to your institution."
          : "Event cancelled. Confirmed registrations have been cancelled.",
      );
      setCancelling(null);
      events.reload();
      focusCampusHeading();
    } catch {
      /* Server permission/version/capacity errors remain visible. */
    }
  }
  return (
    <>
      <div className="page-heading organizer-heading">
        <div>
          <p className="eyebrow muted">
            {access.data.institution_name} · TRUSTED ORGANIZER
          </p>
          <h1 tabIndex={-1}>
            Organizer studio<span className="blue-dot">.</span>
          </h1>
          <p className="muted">
            Your institution’s shared events. Permissions are checked on every
            server action.
          </p>
        </div>
        <Button onClick={() => setEditing(null)}>
          Create institution event
        </Button>
      </div>
      <div className="page-toolbar campus-toolbar">
        <span className="muted">
          Only events owned by your account appear here.
        </span>
        <Button
          variant="outline"
          onClick={() => {
            access.reload();
            events.reload();
          }}
        >
          Refresh studio
        </Button>
      </div>
      <ActionError error={action.error} />
      {events.status !== "ready" ? (
        <QueryState resource={events} />
      ) : events.data?.length ? (
        <div className="table-scroll">
          <table className="organizer-table">
            <thead>
              <tr>
                <th scope="col">EVENT</th>
                <th scope="col">DATE</th>
                <th scope="col">STATUS</th>
                <th scope="col">REGISTRATIONS</th>
                <th scope="col">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {events.data.map((event) => (
                <tr key={event.id}>
                  <td>
                    <Link
                      className="table-event"
                      to={`/campus/events/${event.id}`}
                    >
                      <strong>{event.title}</strong>
                    </Link>
                  </td>
                  <td>{eventDate(event.starts_at)}</td>
                  <td>{event.status}</td>
                  <td>
                    <button
                      className="attendees-link"
                      onClick={() => setViewing(event)}
                    >
                      {event.confirmed_count} confirmed / {event.capacity}
                    </button>
                    <p className="small muted">
                      {event.waiting_count} waiting · {event.available_seats}{" "}
                      available
                    </p>
                  </td>
                  <td>
                    <div className="table-actions">
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/campus/organizer/${event.id}/analytics`}>
                          View analytics
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/campus/organizer/${event.id}/check-in`}>
                          Check in
                        </Link>
                      </Button>
                      {event.editable && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing(event)}
                        >
                          Edit
                        </Button>
                      )}
                      {event.status === "draft" && (
                        <Button
                          size="sm"
                          disabled={action.busy}
                          onClick={() => void status(event, "published")}
                        >
                          Publish event
                        </Button>
                      )}
                      {event.status !== "cancelled" && event.editable && (
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={action.busy}
                          onClick={() => setCancelling(event)}
                        >
                          Cancel event
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Your first shared event starts here."
          description="Create a draft, review it, then publish it to your institution."
        />
      )}
      <Dialog
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open && !formBusy) setEditing(undefined);
        }}
        title={editing ? "Edit institution event" : "Create institution event"}
        description="Save a private draft first. Publish only when the details and capacity are ready."
        className="event-form-dialog"
      >
        {editing !== undefined && (
          <LiveEventForm
            key={editing?.id || "new"}
            event={editing || undefined}
            onBusy={setFormBusy}
            onSaved={() => {
              setEditing(undefined);
              events.reload();
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={!!viewing}
        onOpenChange={(open) => {
          if (!open) setViewing(null);
        }}
        title={viewing?.title || "Event attendees"}
        description="Confirmed and cancelled registrations for an event you control."
      >
        {viewing && <Attendees event={viewing} />}
      </Dialog>
      <Dialog
        open={!!cancelling}
        onOpenChange={(open) => {
          if (!open && !action.busy) setCancelling(null);
        }}
        title="Cancel this institution event?"
        description={`Cancelling ${cancelling?.title || "this event"} also cancels all confirmed registrations. This cannot be undone.`}
      >
        <ActionError error={action.error} />
        <div className="dialog-actions">
          <Button
            variant="outline"
            disabled={action.busy}
            onClick={() => setCancelling(null)}
          >
            Keep event
          </Button>
          <Button
            variant="danger"
            disabled={action.busy}
            onClick={() => cancelling && void status(cancelling, "cancelled")}
          >
            {action.busy ? "Cancelling event…" : "Confirm event cancellation"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
