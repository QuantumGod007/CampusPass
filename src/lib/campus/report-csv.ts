import type { CampusRepository } from "./repository";
import { CampusError } from "./repository";
import type { ReportHeader, ReportPage } from "./reporting-schema";
// Quote every cell and neutralize formula prefixes after Unicode normalization
// and whitespace/control cleanup. Never use event/student text as a filename.
export function csvCell(value: string | number | boolean | null) {
  let text = String(value ?? "")
    .normalize("NFKC")
    .replace(/\p{Cc}/gu, " ")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "");
  if (/^[\s]*[=+\-@]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function csvReportLine(
  header: ReportHeader,
  row: ReportPage["rows"][number],
) {
  const e = header.analytics.event;
  return [
    header.analytics.as_of,
    e.id,
    e.title,
    e.institution_name,
    e.starts_at,
    e.ends_at,
    e.venue,
    row.reference,
    row.display_name,
    row.booking_status,
    row.checked_in_at ? "checked in" : "not checked in",
    row.checked_in_at,
    row.from_waitlist ? "yes" : "no",
  ]
    .map(csvCell)
    .join(",");
}
export async function completeReportCSV(
  repo: CampusRepository,
  owner: string,
  header: ReportHeader,
  signal: AbortSignal,
  progress: (count: number) => void = () => {},
) {
  const lines = [
    "\ufeff" +
      [
        "Report as of",
        "Event ID",
        "Event title",
        "Institution",
        "Starts at (UTC)",
        "Ends at (UTC)",
        "Venue",
        "Booking reference",
        "Attendee display name",
        "Booking status",
        "Check-in status",
        "Check-in recorded at (UTC)",
        "Waitlist promotion",
      ]
        .map(csvCell)
        .join(","),
  ];
  let after = 0;
  do {
    signal.throwIfAborted();
    const page = await repo.reportPage(
      owner,
      header.event_id,
      header.id,
      after,
      signal,
    );
    signal.throwIfAborted();
    if (
      page.row_count !== header.row_count ||
      page.snapshot_id !== header.id ||
      page.event_id !== header.event_id
    )
      throw new CampusError(
        "report_changed",
        "The report changed. Generate a new complete report.",
      );
    for (const row of page.rows) {
      if (row.position !== after + 1)
        throw new CampusError(
          "incomplete",
          "The report is incomplete. No file was downloaded.",
        );
      after = row.position;
      lines.push(csvReportLine(header, row));
    }
    progress(after);
    if (page.next_after === null) {
      if (after !== header.row_count)
        throw new CampusError(
          "incomplete",
          "The report is incomplete. No file was downloaded.",
        );
      break;
    }
    if (
      !page.rows.length ||
      page.next_after !== after ||
      after >= header.row_count
    )
      throw new CampusError(
        "incomplete",
        "The report cursor is invalid. No file was downloaded.",
      );
  } while (after < header.row_count);
  signal.throwIfAborted();
  return lines.join("\r\n") + "\r\n";
}
export function downloadReportCSV(csv: string, eventId: string) {
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `campuspass-${eventId}-attendance.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
