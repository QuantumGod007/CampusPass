import { z } from "zod";
import type { CampusEvent } from "../types";

type CalendarEvent = Pick<
  CampusEvent,
  "id" | "title" | "venue" | "description"
> &
  Partial<Pick<CampusEvent, "start" | "end">>;

// Stored events are absolute ISO timestamps. Reject floating/local dates rather
// than guessing a time zone, and validate calendar dates before Date normalizes them.
const timestamp = z.iso.datetime({ offset: true });
const encoder = new TextEncoder();

function formatUtc(date: Date) {
  return date.toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z";
}

function validDate(date: Date) {
  return (
    Number.isFinite(date.getTime()) &&
    date.getUTCFullYear() >= 1 &&
    date.getUTCFullYear() <= 9999
  );
}

export function eventCalendarDates(
  event: Partial<Pick<CampusEvent, "start" | "end">>,
) {
  const parsedStart = timestamp.safeParse(event.start);
  const parsedEnd = timestamp.safeParse(event.end);
  if (!parsedStart.success || !parsedEnd.success) return null;
  const start = new Date(parsedStart.data);
  const end = new Date(parsedEnd.data);
  if (!validDate(start) || !validDate(end)) return null;
  const dates = { start: formatUtc(start), end: formatUtc(end) };
  // iCalendar has second precision and requires an exclusive end after the start.
  return dates.end > dates.start ? dates : null;
}

function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\p{Cc}/gu, "");
}

function foldLine(line: string) {
  let folded = "";
  let octets = 0;
  // Fold at 75 UTF-8 octets, preserving complete Unicode code points. The
  // continuation space counts toward the next physical line's limit (RFC 5545).
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (octets + size > 75) {
      folded += "\r\n ";
      octets = 1;
    }
    folded += character;
    octets += size;
  }
  return folded;
}

export function createEventCalendar(
  event: CalendarEvent,
  generatedAt = new Date(),
): string | null {
  const dates = eventCalendarDates(event);
  if (!dates || !validDate(generatedAt)) return null;
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//CampusPass//Event Bookings//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${escapeText(event.id)}@campuspass.local`,
      `DTSTAMP:${formatUtc(generatedAt)}`,
      `DTSTART:${dates.start}`,
      `DTEND:${dates.end}`,
      `SUMMARY:${escapeText(event.title)}`,
      `LOCATION:${escapeText(event.venue)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .map(foldLine)
      .join("\r\n") + "\r\n"
  );
}
