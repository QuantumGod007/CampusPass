import { useEffect, useId, useRef, useState } from "react";
import { CalendarPlus, ChevronDown, Download } from "lucide-react";
import { Button } from "../../components/ui/button";
import { useToast } from "../../components/toast";
import {
  createEventCalendar,
  createGoogleCalendarUrl,
} from "../../lib/calendar";
import type { CampusEvent } from "../../types";

export function CalendarActions({
  event,
  disabled,
  unavailableDescriptionId,
}: {
  event: CampusEvent;
  disabled: boolean;
  unavailableDescriptionId?: string;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const helpId = useId();
  const toast = useToast();
  const url = createGoogleCalendarUrl(event);
  const unavailable = disabled || !url;
  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: Event) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    document.addEventListener("keydown", dismissEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
      document.removeEventListener("keydown", dismissEscape);
    };
  }, [open]);

  const download = () => {
    const calendar = createEventCalendar(event);
    if (unavailable || !calendar) return;
    setOpen(false);
    toggle.current?.focus();
    try {
      const objectUrl = URL.createObjectURL(
        new Blob([calendar], { type: "text/calendar;charset=utf-8" }),
      );
      const link = document.createElement("a");
      try {
        link.href = objectUrl;
        link.download = "campuspass-event.ics";
        document.body.appendChild(link);
        link.click();
      } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
    } catch {
      toast("Calendar download is unavailable. Please try again.", true);
    }
  };

  return (
    <div className="calendar-actions" ref={container}>
      <div className="calendar-split">
        {unavailable ? (
          <Button
            variant="ghost"
            className="calendar-primary"
            disabled
            aria-describedby={unavailableDescriptionId}
          >
            <CalendarPlus size={16} /> Add to Calendar
          </Button>
        ) : (
          <Button variant="ghost" className="calendar-primary" asChild>
            <a
              href={url!}
              target="_blank"
              rel="noopener noreferrer"
              aria-describedby={helpId}
            >
              <CalendarPlus size={16} /> Add to Calendar
            </a>
          </Button>
        )}
        <button
          className="button button-ghost calendar-toggle"
          ref={toggle}
          disabled={unavailable}
          aria-label="More calendar options"
          aria-expanded={open && !unavailable}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronDown size={15} />
        </button>
      </div>
      <span id={helpId} className="sr-only">
        Opens a Google Calendar draft in a new tab. Review the event and save it
        there.
      </span>
      {open && !unavailable && (
        <div className="calendar-options-panel" id={panelId}>
          <button className="calendar-download" onClick={download}>
            <Download size={17} />
            <span>
              Apple Calendar / Outlook<small>Download .ics file</small>
            </span>
          </button>
          <p>Google Calendar opens a draft for you to review and save.</p>
        </div>
      )}
    </div>
  );
}
