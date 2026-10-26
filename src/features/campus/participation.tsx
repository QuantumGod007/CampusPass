import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { getCampusRepository } from "../../lib/campus/repository";
import { useAccountQuery, useCampusIdentity } from "./hooks";
import { QueryState } from "./shared";
import { eventDate, eventTime } from "../../lib/utils";
export function CampusParticipation() {
  const { bookingId = "" } = useParams();
  return <CampusParticipationPanel bookingId={bookingId} />;
}
export function CampusParticipationPanel({
  bookingId,
  compact = false,
}: {
  bookingId: string;
  compact?: boolean;
}) {
  const { key } = useCampusIdentity();
  return key ? (
    <Participation
      key={`${key}:${bookingId}`}
      bookingId={bookingId}
      compact={compact}
    />
  ) : null;
}
function Participation({
  bookingId,
  compact,
}: {
  bookingId: string;
  compact: boolean;
}) {
  const resource = useAccountQuery(
    useCallback(
      (owner: string, signal: AbortSignal) =>
        getCampusRepository().participation(owner, bookingId, signal),
      [bookingId],
    ),
    bookingId,
  );
  const result = resource.data,
    r = result?.record;
  const explanation = {
    event_cancelled:
      "The event was cancelled. No participation acknowledgement is available.",
    booking_cancelled:
      "This booking was cancelled. It cannot receive a participation acknowledgement.",
    event_not_ended:
      "Participation acknowledgements are available only after the event ends and a successful check-in is recorded.",
    not_checked_in:
      "No successful check-in was recorded for this booking. Registration alone does not establish attendance.",
  };
  return (
    <section
      className={compact ? "admission-card" : "participation-workspace"}
      aria-label="Recorded participation"
    >
      <div className="participation-controls">
        <h1 tabIndex={-1}>
          {compact
            ? "Attendance & participation"
            : "Recorded participation acknowledgement"}
        </h1>
        <Button variant="outline" onClick={resource.reload}>
          Refresh participation status
        </Button>
        {!compact && (
          <Link className="text-link" to={`/campus/bookings/${bookingId}`}>
            Return to your booking
          </Link>
        )}
      </div>
      {resource.status !== "ready" ? (
        <QueryState resource={resource} />
      ) : r ? (
        compact ? (
          <>
            <p role="status">
              Participation recorded · Checked in{" "}
              {new Date(r.checked_in_at).toLocaleString()}.
            </p>
            <Button asChild>
              <Link to={`/campus/bookings/${bookingId}/participation`}>
                View participation record
              </Link>
            </Button>
          </>
        ) : (
          <>
            <article className="campus-participation">
              <p className="eyebrow muted">{r.institution_name}</p>
              <h2>Recorded participation acknowledgement</h2>
              <p className="participation-name">{r.display_name}</p>
              <p>has a successful CampusPass check-in recorded for</p>
              <h3>{r.event_title}</h3>
              <p>
                {eventDate(r.starts_at)} · {eventTime(r.starts_at)} –{" "}
                {eventDate(r.ends_at)} · {eventTime(r.ends_at)}
              </p>
              <p>{r.venue}</p>
              <dl>
                <div>
                  <dt>Booking reference</dt>
                  <dd>{r.reference}</dd>
                </div>
                <div>
                  <dt>Check-in recorded</dt>
                  <dd>{new Date(r.checked_in_at).toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Record identifier</dt>
                  <dd>{r.id}</dd>
                </div>
                <div>
                  <dt>Issued</dt>
                  <dd>{new Date(r.issued_at).toLocaleString()}</dd>
                </div>
              </dl>
              <p className="participation-disclaimer">
                This is a recorded participation acknowledgement. It does not
                prove physical identity, academic credit or an officially
                verified certificate. QR admission verifies a valid credential,
                not the physical person presenting it. Times shown in your
                device’s time zone.
              </p>
            </article>
            <Button
              className="participation-controls"
              onClick={() => window.print()}
            >
              Print / save participation record
            </Button>
          </>
        )
      ) : (
        <p role="status">
          {result?.reason
            ? explanation[result.reason]
            : "No participation record is available."}
          {result?.checked_in_at && (
            <>
              {" "}
              Check-in recorded:{" "}
              {new Date(result.checked_in_at).toLocaleString()}.
            </>
          )}
        </p>
      )}
    </section>
  );
}
