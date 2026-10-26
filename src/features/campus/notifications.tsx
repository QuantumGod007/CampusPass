import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "../../components/ui/button";
import { getCampusRepository } from "../../lib/campus/repository";
import { useAccountQuery, useCampusAction, useCampusIdentity } from "./hooks";
import { ActionError, QueryState } from "./shared";
import { inboxChanged } from "./waitlists";
import { eventDate, eventTime } from "../../lib/utils";
export function CampusNotificationLink() {
  const { pathname } = useLocation();
  const resource = useAccountQuery(
    useCallback(
      (owner: string, signal: AbortSignal) =>
        getCampusRepository().notifications(owner, undefined, signal),
      [],
    ),
    pathname,
  );
  const reload = resource.reload;
  useEffect(() => {
    window.addEventListener("campus-inbox-changed", reload);
    return () => window.removeEventListener("campus-inbox-changed", reload);
  }, [reload]);
  const label =
    resource.status === "ready"
      ? `Notifications, ${resource.data!.unread_count} unread`
      : resource.status === "error"
        ? "Notifications unavailable. Open inbox to retry."
        : "Notifications loading";
  return (
    <Link className="campus-inbox-link" to="/campus/notifications">
      <Bell size={16} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}
export function CampusNotifications() {
  const { key } = useCampusIdentity();
  return key ? <Inbox key={key} /> : null;
}
function Inbox() {
  const [before, setBefore] = useState<string>();
  const resource = useAccountQuery(
    useCallback(
      (owner: string, signal: AbortSignal) =>
        getCampusRepository().notifications(owner, before, signal),
      [before],
    ),
    before || "latest",
  );
  const action = useCampusAction();
  async function mark(id: string) {
    try {
      await action.run((repo, owner, signal) =>
        repo.markNotificationRead(owner, id, signal),
      );
      resource.reload();
      inboxChanged();
    } catch {
      /* No optimistic read receipt. */
    }
  }
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow muted">YOUR ACCOUNT · IN-APP ONLY</p>
        <h1 tabIndex={-1}>
          Notifications<span className="blue-dot">.</span>
        </h1>
        <p className="muted">
          Persistent updates about your events, bookings and waitlists. Refresh
          to check for new updates; no email, SMS or push delivery.
        </p>
      </div>
      <div className="page-toolbar campus-toolbar">
        <p role="status">
          {resource.status === "ready"
            ? `${resource.data!.unread_count} unread notifications`
            : resource.status === "error"
              ? "Unread count unavailable."
              : "Loading your inbox…"}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setBefore(undefined);
            resource.reload();
            inboxChanged();
          }}
        >
          Refresh inbox
        </Button>
      </div>
      <ActionError error={action.error} />
      {resource.status !== "ready" ? (
        <QueryState resource={resource} />
      ) : resource.data!.items.length ? (
        <>
          <ul className="campus-notifications">
            {resource.data!.items.map((item) => (
              <li key={item.id}>
                <div>
                  <span className="eyebrow muted">
                    {item.read_at ? "READ" : "UNREAD"}
                  </span>
                  <h2>{item.title}</h2>
                  <p>{item.body}</p>
                  <p className="small muted">
                    {eventDate(item.created_at)} · {eventTime(item.created_at)}
                  </p>
                  <Link
                    className="text-link"
                    to={
                      item.booking_id
                        ? `/campus/bookings/${item.booking_id}`
                        : `/campus/events/${item.event_id}`
                    }
                  >
                    {item.booking_id ? "Open booking" : "Open event"}
                  </Link>
                </div>
                {!item.read_at && (
                  <Button
                    variant="outline"
                    disabled={action.busy}
                    onClick={() => void mark(item.id)}
                    aria-label={`Mark as read: ${item.title}`}
                  >
                    Mark as read
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {resource.data!.has_more && (
            <Button
              variant="outline"
              onClick={() => setBefore(resource.data!.items.at(-1)!.id)}
            >
              Older notifications
            </Button>
          )}
          {before && (
            <Button variant="outline" onClick={() => setBefore(undefined)}>
              Latest notifications
            </Button>
          )}
        </>
      ) : (
        <p className="subtle-notice">Your inbox is empty on this page.</p>
      )}
    </>
  );
}
