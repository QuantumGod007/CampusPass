import { useCallback, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { CampusError, getCampusRepository } from "../../lib/campus/repository";
import type {
  ReportHeader,
  ReportPage,
} from "../../lib/campus/reporting-schema";
import {
  completeReportCSV,
  downloadReportCSV,
} from "../../lib/campus/report-csv";
import { useAccountQuery, useCampusAction, useCampusIdentity } from "./hooks";
import { ActionError, QueryState } from "./shared";
import { eventDate, eventTime } from "../../lib/utils";
export function CampusAnalytics() {
  const { eventId = "" } = useParams();
  const { key } = useCampusIdentity();
  return key ? <Analytics key={`${key}:${eventId}`} eventId={eventId} /> : null;
}
function Analytics({ eventId }: { eventId: string }) {
  const resource = useAccountQuery(
    useCallback(
      (owner: string, signal: AbortSignal) =>
        getCampusRepository().analytics(owner, eventId, signal),
      [eventId],
    ),
    eventId,
  );
  const action = useCampusAction();
  const request = useRef<string | null>(null);
  const [report, setReport] = useState<ReportHeader | null>(null),
    [page, setPage] = useState<ReportPage | null>(null),
    [notice, setNotice] = useState("");
  async function generate() {
    request.current ??= crypto.randomUUID();
    setReport(null);
    setPage(null);
    setNotice("Generating a private report snapshot…");
    try {
      const result = await action.run(async (repo, owner, signal) => {
        const header = await repo.startReport(
          owner,
          eventId,
          request.current!,
          signal,
        );
        const page = await repo.reportPage(
          owner,
          eventId,
          header.id,
          0,
          signal,
        );
        return { header, page };
      });
      setReport(result.header);
      setPage(result.page);
      request.current = null;
      setNotice(
        `Report ready: ${result.header.row_count} booking records, as of ${new Date(result.header.analytics.as_of).toLocaleString()}.`,
      );
    } catch (error) {
      if (error instanceof CampusError && error.code === "P1041")
        request.current = null;
      setNotice(
        "Report generation failed. Retry safely; no file was downloaded.",
      );
    }
  }
  async function next(after: number) {
    if (!report) return;
    try {
      const result = await action.run((repo, owner, signal) =>
        repo.reportPage(owner, eventId, report.id, after, signal),
      );
      setPage(result);
    } catch {
      setPage(null);
      setNotice("Report unavailable. Generate a new snapshot to continue.");
    }
  }
  async function download() {
    if (!report) return;
    setNotice(`Preparing complete CSV: 0 / ${report.row_count} records…`);
    try {
      const csv = await action.run((repo, owner, signal) =>
        completeReportCSV(repo, owner, report, signal, (count) =>
          setNotice(
            `Preparing complete CSV: ${count} / ${report.row_count} records…`,
          ),
        ),
      );
      downloadReportCSV(csv, eventId);
      setNotice(
        `Complete CSV downloaded: ${report.row_count} booking records from one snapshot.`,
      );
    } catch {
      setNotice("CSV export failed. No partial file was downloaded.");
    }
  }
  const a = resource.data;
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow muted">OWNING ORGANIZER · PRIVATE REPORTING</p>
        <h1 tabIndex={-1}>
          Event analytics<span className="blue-dot">.</span>
        </h1>
        <p className="muted">
          Committed PostgreSQL records. Refresh for a new view; CSV reports
          preserve their generation snapshot.
        </p>
      </div>
      <Link className="text-link" to="/campus/organizer">
        Back to organizer studio
      </Link>
      <div className="page-toolbar campus-toolbar">
        <Button
          variant="outline"
          disabled={action.busy}
          onClick={resource.reload}
        >
          Refresh analytics
        </Button>
      </div>
      {resource.status !== "ready" ? (
        <QueryState resource={resource} />
      ) : (
        a && (
          <>
            <section className="analytics-overview">
              <h2>{a.event.title}</h2>
              <p>
                {a.event.institution_name} · {a.event.venue}
              </p>
              <p>
                {eventDate(a.event.starts_at)} · {eventTime(a.event.starts_at)}{" "}
                – {eventDate(a.event.ends_at)} · {eventTime(a.event.ends_at)}
              </p>
              <p>
                <strong>{a.lifecycle}</strong> · Stored status: {a.event.status}
              </p>
              <p className="small muted">
                Server view as of {new Date(a.as_of).toLocaleString()}. Times
                shown in your device’s time zone.
              </p>
            </section>
            <dl className="analytics-kpis">
              {Object.entries({
                Capacity: a.metrics.capacity,
                "Current confirmed": a.metrics.confirmed,
                "Historical cancellations": a.metrics.cancelled,
                "Active waiting": a.metrics.active_waitlist,
                "Historical promotions": a.metrics.promotions,
                "All successful check-ins": a.metrics.total_checkins,
                "Confirmed checked in": a.metrics.confirmed_checked_in,
                "Confirmed not checked in": a.metrics.confirmed_not_checked_in,
                "Check-in completion": `${a.metrics.checkin_percentage}%`,
                "Unreserved capacity": a.metrics.remaining_seats,
              }).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <section
              className="analytics-chart"
              aria-label="Attendance comparison"
            >
              <h2>Confirmed registrations and attendance</h2>
              <p>
                {a.metrics.confirmed_checked_in} checked in /{" "}
                {a.metrics.confirmed} current confirmed registrations ·{" "}
                {a.metrics.checkin_percentage}%
              </p>
              <meter
                min={0}
                max={Math.max(1, a.metrics.confirmed)}
                value={a.metrics.confirmed_checked_in}
                aria-label="Current confirmed attendance completion"
              />
              <p className="small muted">
                The percentage uses current confirmed bookings. All successful
                check-ins also include historical admissions attached to
                bookings later cancelled. {a.metrics.booking_records} total
                booking records include cancellations and rebookings.
              </p>
            </section>
            <section className="analytics-chart">
              <h2>Check-in activity over time</h2>
              <p className="small muted">
                All successful admissions, in up to 20 server-calculated time
                groups.
              </p>
              {a.timeline.length ? (
                <ol className="analytics-timeline">
                  {a.timeline.map((bin, i) => (
                    <li key={i}>
                      <span>
                        {eventDate(bin.starts_at)} {eventTime(bin.starts_at)} –{" "}
                        {eventTime(bin.ends_at)} · {bin.count} check-ins
                      </span>
                      <div
                        style={{
                          width: `${(100 * bin.count) / Math.max(...a.timeline.map((b) => b.count))}%`,
                        }}
                      />
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No successful check-ins recorded.</p>
              )}
            </section>
            <section className="analytics-report">
              <h2>Authorized attendance report</h2>
              <p>
                Includes current and historical booking records for{" "}
                {a.event.title}. Names and references only; no PRNs, emails or
                private audit notes.
              </p>
              <div className="table-actions">
                <Button disabled={action.busy} onClick={() => void generate()}>
                  Generate attendee report
                </Button>
                <Button
                  variant="outline"
                  disabled={action.busy || !report}
                  onClick={() => void download()}
                >
                  Download complete CSV
                </Button>
              </div>
              {notice && <p role="status">{notice}</p>}
              {report && (
                <p className="small muted">
                  Selected snapshot: {report.row_count} records · as of{" "}
                  {new Date(report.analytics.as_of).toLocaleString()}. Expires{" "}
                  {new Date(report.expires_at).toLocaleString()}. Later activity
                  is included only in a newly generated report.
                </p>
              )}
              {page &&
                (page.rows.length ? (
                  <div className="table-scroll">
                    <table className="organizer-table">
                      <thead>
                        <tr>
                          <th>REFERENCE</th>
                          <th>ATTENDEE</th>
                          <th>BOOKING</th>
                          <th>ADMISSION</th>
                          <th>CHECK-IN TIME</th>
                          <th>WAITLIST</th>
                        </tr>
                      </thead>
                      <tbody>
                        {page.rows.map((row) => (
                          <tr key={row.position}>
                            <td>{row.reference}</td>
                            <td>{row.display_name}</td>
                            <td>{row.booking_status}</td>
                            <td>
                              {row.checked_in_at
                                ? "checked in"
                                : "not checked in"}
                            </td>
                            <td>
                              {row.checked_in_at
                                ? new Date(row.checked_in_at).toLocaleString()
                                : "—"}
                            </td>
                            <td>{row.from_waitlist ? "promoted" : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>
                    No booking records in this snapshot. The complete CSV
                    contains its header only.
                  </p>
                ))}
              {page && (
                <div className="table-actions">
                  {page.rows[0]?.position > 1 && (
                    <Button
                      variant="outline"
                      disabled={action.busy}
                      onClick={() => void next(0)}
                    >
                      First report page
                    </Button>
                  )}
                  {page.next_after !== null && (
                    <Button
                      variant="outline"
                      disabled={action.busy}
                      onClick={() => void next(page.next_after!)}
                    >
                      Next report page
                    </Button>
                  )}
                </div>
              )}
            </section>
          </>
        )
      )}
      <ActionError error={action.error} />
    </>
  );
}
