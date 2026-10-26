import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import type { LiveEvent } from "../../lib/campus/schema";
import { getCampusRepository } from "../../lib/campus/repository";
import { useAccountQuery, useCampusAction, useCampusIdentity } from "./hooks";
import { ActionError, QueryState } from "./shared";
export function inboxChanged() {
  window.dispatchEvent(new Event("campus-inbox-changed"));
}
export function CampusWaitlist({
  event,
  onChanged,
}: {
  event: LiveEvent;
  onChanged: () => void;
}) {
  const { key } = useCampusIdentity();
  return key ? (
    <Waitlist key={`${key}:${event.id}`} event={event} onChanged={onChanged} />
  ) : null;
}
function Waitlist({
  event,
  onChanged,
}: {
  event: LiveEvent;
  onChanged: () => void;
}) {
  const resource = useAccountQuery(
    useCallback(
      (owner: string, signal: AbortSignal) =>
        getCampusRepository().waitlist(owner, event.id, signal),
      [event.id],
    ),
    event.id,
  );
  const action = useCampusAction();
  const request = useRef<string | null>(null);
  const [consent, setConsent] = useState(false),
    [notice, setNotice] = useState("");
  const entry = resource.data?.entry;
  async function join() {
    if (!consent) return;
    request.current ??= crypto.randomUUID();
    try {
      const value = await action.run((repo, owner, signal) =>
        repo.joinWaitlist(owner, event.id, request.current!, signal),
      );
      if (value.entry && value.entry.status !== "waiting")
        request.current = null;
      setNotice(
        value.outcome === "available"
          ? "A seat is available. Refresh availability and confirm registration normally."
          : value.entry?.status === "waiting"
            ? "You joined the waitlist. A free seat may be automatically confirmed for you."
            : "This earlier request is already complete. Refresh to see its status.",
      );
      resource.reload();
      onChanged();
      inboxChanged();
    } catch {
      resource.reload();
    }
  }
  async function leave() {
    if (!entry) return;
    try {
      const value = await action.run((repo, owner, signal) =>
        repo.withdrawWaitlist(owner, entry.id, signal),
      );
      setNotice(
        value.status === "promoted"
          ? "A seat was already confirmed. Open the booking to cancel your registration."
          : "You left the waitlist.",
      );
      request.current = null;
      setConsent(false);
      resource.reload();
      onChanged();
      inboxChanged();
    } catch {
      resource.reload();
    }
  }
  return (
    <section className="campus-waitlist" aria-label="Event waitlist">
      <h3>Event waitlist</h3>
      {resource.status !== "ready" ? (
        <QueryState resource={resource} />
      ) : (
        <>
          {entry?.status === "waiting" ? (
            <>
              <p role="status">
                You are waiting · Position {entry.position} of{" "}
                {resource.data!.waiting_count}
              </p>
              <p className="small muted">
                Positions can change when eligibility is rechecked. A free seat
                may be automatically confirmed before the event starts.
              </p>
              <Button
                variant="outline"
                disabled={action.busy}
                onClick={() => void leave()}
              >
                Leave waitlist
              </Button>
            </>
          ) : entry?.status === "promoted" &&
            entry.booking_status === "confirmed" ? (
            <>
              <p role="status">Promoted · Your registration was confirmed.</p>
              <Button asChild>
                <Link to={`/campus/bookings/${entry.booking_id}`}>
                  Open promoted booking
                </Link>
              </Button>
            </>
          ) : (
            <>
              <p>
                {entry
                  ? `Previous entry: ${entry.status}${entry.reason ? ` (${entry.reason.replaceAll("_", " ")})` : entry.booking_status === "cancelled" ? " (booking cancelled)" : ""}.`
                  : "You are not waiting for this event."}
              </p>
              {event.registration_open && event.available_seats === 0 && (
                <>
                  <label className="waitlist-consent">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    I agree that a free seat may be automatically confirmed for
                    me before this event starts. No payment is involved.
                  </label>
                  <Button
                    disabled={
                      !consent ||
                      action.busy ||
                      resource.data!.waiting_count >= 100
                    }
                    onClick={() => void join()}
                  >
                    {action.busy ? "Joining…" : "Join waitlist"}
                  </Button>
                  {resource.data!.waiting_count >= 100 && (
                    <p>The waitlist is full (100 people).</p>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
      <ActionError error={action.error} />
      {notice && <p role="status">{notice}</p>}
      <Button
        variant="outline"
        onClick={() => {
          resource.reload();
          onChanged();
        }}
      >
        Refresh waitlist
      </Button>
    </section>
  );
}
