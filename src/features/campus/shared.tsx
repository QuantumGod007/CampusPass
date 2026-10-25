import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useAuth } from "../../app/auth";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/empty-state";
import type { CampusError } from "../../lib/campus/repository";
import type { CampusAccess, LiveEvent } from "../../lib/campus/schema";
import { eventDate, eventTime } from "../../lib/utils";
import "./campus.css";
export function CampusLayout() {
  const auth = useAuth();
  const { pathname } = useLocation();
  if (auth.status === "disabled")
    return (
      <div className="container page campus-view">
        <EmptyState
          title="Campus accounts aren’t configured."
          description="The original browser-local demo is still available."
        />
        <Button asChild>
          <Link to="/">Explore the demo</Link>
        </Button>
      </div>
    );
  if (auth.status === "unauthenticated")
    return (
      <Navigate to={`/login?next=${encodeURIComponent(pathname)}`} replace />
    );
  if (auth.status === "error")
    return (
      <div className="container page">
        <p role="alert">Your session could not be restored.</p>
        <Button onClick={auth.retry}>Try again</Button>
      </div>
    );
  if (auth.status === "loading" || auth.isSigningOut)
    return (
      <div className="container page">
        <Loading />
      </div>
    );
  // Remount all live page state on user changes; hooks additionally mask old
  // values synchronously and pin/abort requests on token and session changes.
  return (
    <div className="container page campus-view" key={auth.user?.id}>
      <p className="campus-boundary">
        <strong>INSTITUTION EVENTS</strong> · Shared account data.{" "}
        <Link to="/">
          Switch to the local demo <ArrowLeft size={13} />
        </Link>
      </p>
      <Outlet />
    </div>
  );
}
export function Loading() {
  return (
    <p role="status" className="campus-loading">
      <LoaderCircle size={20} />
      Loading from your institution…
    </p>
  );
}
export function QueryState({
  resource,
}: {
  resource: { status: string; error: CampusError | null; reload: () => void };
}) {
  return resource.status === "error" ? (
    <div className="account-card">
      <p role="alert">{resource.error?.message}</p>
      <Button onClick={resource.reload}>Try again</Button>
    </div>
  ) : (
    <Loading />
  );
}
export function MembershipNotice({
  access,
  organizer = false,
}: {
  access: CampusAccess;
  organizer?: boolean;
}) {
  if (organizer && access.institution_id)
    return (
      <EmptyState
        title="Organizer access hasn’t been provisioned."
        description="A trusted institution operator must grant organizer access. Student accounts cannot assign their own role."
      />
    );
  return (
    <div className="account-card">
      <h2>Institution membership is required.</h2>
      <p>
        Your account is not currently associated with an active institution.
        Contact your institution for trusted provisioning.
      </p>
      <Button asChild variant="outline">
        <Link to="/account/profile">View student profile</Link>
      </Button>
    </div>
  );
}
export function Availability({ event }: { event: LiveEvent }) {
  return (
    <span
      className={`availability ${event.available_seats === 0 ? "unavailable" : ""}`}
    >
      <span className="availability-dot" />
      {event.status === "cancelled"
        ? "Event cancelled"
        : !event.registration_open
          ? "Registration closed"
          : event.available_seats === 0
            ? "Fully booked"
            : `${event.available_seats} ${event.available_seats === 1 ? "seat" : "seats"} available`}
    </span>
  );
}
export function EventFacts({ event }: { event: LiveEvent }) {
  return (
    <>
      <p>
        {eventDate(event.starts_at)} · {eventTime(event.starts_at)} –{" "}
        {eventTime(event.ends_at)}
      </p>
      <p>{event.venue}</p>
      <p className="muted small">Times shown in your device’s time zone.</p>
    </>
  );
}
export function ActionError({ error }: { error: CampusError | null }) {
  return error ? (
    <p className="form-alert" role="alert">
      {error.message}
    </p>
  ) : null;
}
export function focusCampusHeading() {
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>(".campus-view h1")?.focus(),
  );
}
