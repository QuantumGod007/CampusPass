import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { Button } from "../../components/ui/button";
import { Field, Input } from "../../components/ui/field";
import {
  admissionTokenSchema,
  type IssuedPass,
  type ScanResult,
} from "../../lib/campus/schema";
import { getCampusRepository } from "../../lib/campus/repository";
import { useAccountQuery, useCampusAction, useCampusIdentity } from "./hooks";
import { ActionError, QueryState } from "./shared";
import { eventDate } from "../../lib/utils";

function QR({ token }: { token: string }) {
  const { size, path } = useMemo(() => {
    const modules = QRCode.create(token, { errorCorrectionLevel: "M" }).modules;
    let path = "";
    for (let y = 0; y < modules.size; y++)
      for (let x = 0; x < modules.size; x++)
        if (modules.get(y, x)) path += `M${x + 4},${y + 4}h1v1h-1z`;
    return { size: modules.size + 8, path };
  }, [token]);
  return (
    <svg
      className="admission-qr"
      role="img"
      aria-label="Temporary event entry QR code"
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="white" />
      <path d={path} fill="black" />
    </svg>
  );
}
export function CampusEntryPass({ bookingId }: { bookingId: string }) {
  const { key } = useCampusIdentity();
  return key ? (
    <EntryPass key={`${key}:${bookingId}`} bookingId={bookingId} />
  ) : null;
}
function EntryPass({ bookingId }: { bookingId: string }) {
  const resource = useAccountQuery(
    useCallback(
      (owner: string, signal: AbortSignal) =>
        getCampusRepository().passStatus(owner, bookingId, signal),
      [bookingId],
    ),
    bookingId,
  );
  const action = useCampusAction();
  const reload = resource.reload;
  const [pass, setPass] = useState<{
    value: IssuedPass;
    deadline: number;
  } | null>(null);
  const [now, setNow] = useState(() => performance.now());
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const clear = () => setPass(null);
    const hidden = () => {
      if (document.hidden) clear();
    };
    window.addEventListener("offline", clear);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("offline", clear);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  useEffect(() => {
    if (!pass) return;
    const timer = window.setInterval(() => {
      const time = performance.now();
      setNow(time);
      if (time >= pass.deadline) setPass(null);
    }, 500);
    const refresh = window.setInterval(() => {
      if (!document.hidden && navigator.onLine) reload();
    }, 5000);
    return () => {
      clearInterval(timer);
      clearInterval(refresh);
    };
  }, [pass, reload]);
  async function issue() {
    setPass(null);
    setNotice("");
    const started = performance.now();
    try {
      const value = await action.run((repo, owner, signal) =>
        repo.issuePass(owner, bookingId, signal),
      );
      if (value.outcome === "rate_limited") {
        setNotice("Too many pass requests. Try again next minute.");
        return;
      }
      const deadline =
        started + Date.parse(value.expires_at) - Date.parse(value.server_now);
      if (
        !navigator.onLine ||
        document.hidden ||
        performance.now() >= deadline
      ) {
        setNotice("Pass expired or connection changed. Request a new pass.");
        return;
      }
      setNow(performance.now());
      setPass({ value, deadline });
    } catch {
      resource.reload();
    }
  }
  const status = resource.data;
  const visible =
    pass &&
    resource.status === "ready" &&
    status?.eligible &&
    !status?.checked_in_at &&
    navigator.onLine &&
    !document.hidden &&
    pass.deadline > now;
  return (
    <section className="admission-card" aria-label="Event admission">
      <p className="eyebrow muted">SECURE ONLINE ENTRY</p>
      <h2>Event admission</h2>
      {resource.status !== "ready" ? (
        <QueryState resource={resource} />
      ) : status?.checked_in_at ? (
        <p role="status">
          <strong>Checked in</strong> · {eventDate(status.checked_in_at)}
        </p>
      ) : (
        <>
          <p>
            {status?.eligible
              ? "Ready for entry. Show a fresh pass to the event organizer."
              : "Entry pass unavailable. Your booking must be confirmed, with active institution access, during the admission window."}
          </p>
          {status && (
            <p className="small muted">
              Entry: {eventDate(status.opens_at)} –{" "}
              {eventDate(status.closes_at)}
            </p>
          )}
          <Button
            disabled={!status?.eligible || action.busy || !navigator.onLine}
            onClick={() => void issue()}
          >
            {action.busy
              ? "Issuing pass…"
              : pass
                ? "Regenerate entry pass"
                : "Show entry pass"}
          </Button>
        </>
      )}
      {visible && (
        <div className="admission-credential">
          <QR token={pass.value.token} />
          <p role="timer" aria-label="Pass expiration">
            Expires in {Math.max(0, Math.ceil((pass.deadline - now) / 1000))}{" "}
            seconds
          </p>
          <details>
            <summary>Manual entry code</summary>
            <code className="admission-code">{pass.value.token}</code>
          </details>
          <p className="small muted">
            A new pass replaces the previous one. Keep this code private.
          </p>
        </div>
      )}
      {!pass && !status?.checked_in_at && (
        <p className="small muted">
          Passes last up to 90 seconds. Expired, hidden or offline passes are
          cleared; use Show entry pass to refresh.
        </p>
      )}
      <ActionError error={action.error} />
      {notice && <p role="status">{notice}</p>}
      <Button
        variant="outline"
        onClick={() => {
          setPass(null);
          resource.reload();
        }}
      >
        Refresh admission status
      </Button>
      <p className="small muted">
        Online booking validation only. A copied valid pass could be used first
        by another person; this does not verify physical identity.
      </p>
    </section>
  );
}

const outcomes: Record<ScanResult["outcome"], string> = {
  admitted: "Admitted — check-in recorded.",
  already_checked_in: "Already checked in — do not admit again.",
  expired: "Pass expired. Ask the student to generate a new pass.",
  invalid:
    "Invalid pass for this event. Use a current entry code, not a booking reference.",
  cancelled: "Booking or event cancelled. Entry denied.",
  ineligible: "Account is no longer eligible. Entry denied.",
  outside_window: "Outside this event’s admission window. Entry denied.",
  rate_limited: "Scan limit reached. Wait until next minute.",
};
interface Detector {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
}
type DetectorConstructor = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats: () => Promise<string[]>;
};
function Camera({ onToken }: { onToken: (token: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let active = true,
      stream: MediaStream | undefined,
      timer: number | undefined;
    const stop = () => {
      active = false;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (video.current) video.current.srcObject = null;
    };
    const hidden = () => {
      if (document.hidden) {
        stop();
        setEnabled(false);
      }
    };
    document.addEventListener("visibilitychange", hidden);
    async function start() {
      try {
        const Detector = (
          window as unknown as { BarcodeDetector?: DetectorConstructor }
        ).BarcodeDetector;
        if (
          !Detector ||
          !navigator.mediaDevices?.getUserMedia ||
          !(await Detector.getSupportedFormats()).includes("qr_code")
        )
          throw Error();
        const detector = new Detector({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!active) {
          stop();
          return;
        }
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
        }
        async function scan() {
          if (!active || !video.current) return;
          try {
            const codes = await detector.detect(video.current);
            if (!active) return;
            const token = codes.find(
              (code) => admissionTokenSchema.safeParse(code.rawValue).success,
            )?.rawValue;
            if (token) {
              stop();
              setEnabled(false);
              onToken(token);
              return;
            }
          } catch {
            stop();
            setEnabled(false);
            setError("Camera scanning failed. Use manual entry.");
            return;
          }
          if (active) timer = window.setTimeout(() => void scan(), 300);
        }
        await scan();
      } catch {
        if (active) {
          stop();
          setEnabled(false);
          setError(
            "Camera unavailable, unsupported or permission denied. Use manual entry below.",
          );
        }
      }
    }
    void start();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [enabled, onToken]);
  return (
    <div className="admission-camera">
      <Button
        variant="outline"
        onClick={() => {
          setError("");
          setEnabled((value) => !value);
        }}
      >
        {enabled ? "Stop camera" : "Scan with camera"}
      </Button>
      <video
        ref={video}
        hidden={!enabled}
        muted
        playsInline
        aria-label="QR scanner camera preview"
      />
      {error && <p role="status">{error}</p>}
    </div>
  );
}
export function CampusCheckin() {
  const { eventId = "" } = useParams();
  const { key } = useCampusIdentity();
  return key ? (
    <CheckinWorkspace key={`${key}:${eventId}`} eventId={eventId} />
  ) : null;
}
function CheckinWorkspace({ eventId }: { eventId: string }) {
  const [before, setBefore] = useState<string>();
  const resource = useAccountQuery(
    useCallback(
      (owner: string, signal: AbortSignal) =>
        getCampusRepository().checkins(owner, eventId, before, signal),
      [eventId, before],
    ),
    `${eventId}:${before || ""}`,
  );
  const action = useCampusAction();
  const [token, setToken] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [invalid, setInvalid] = useState(false);
  const heading = useRef<HTMLParagraphElement>(null);
  const scanned = useCallback((value: string) => {
    setToken(value);
    setResult(null);
    setInvalid(false);
  }, []);
  useEffect(() => {
    const clear = () => {
      setToken("");
      setResult(null);
    };
    const hidden = () => {
      if (document.hidden) clear();
    };
    window.addEventListener("offline", clear);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("offline", clear);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  async function submit() {
    setResult(null);
    setInvalid(false);
    if (!admissionTokenSchema.safeParse(token).success) {
      setInvalid(true);
      return;
    }
    const submitted = token;
    setToken("");
    try {
      const value = await action.run((repo, owner, signal) =>
        repo.scanPass(owner, eventId, submitted, signal),
      );
      setResult(value);
      setBefore(undefined);
      resource.reload();
      requestAnimationFrame(() => heading.current?.focus());
    } catch {
      /* A failed transport is never announced as admission. Retry the same code to reconcile. */
    }
  }
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow muted">TRUSTED ORGANIZER · ONLINE ADMISSION</p>
        <h1 tabIndex={-1}>
          Event check-in<span className="blue-dot">.</span>
        </h1>
        <p className="muted">
          Only the owning organizer can record entry. No attendance overrides.
        </p>
      </div>
      <Link className="text-link" to="/campus/organizer">
        Back to organizer studio / select another event
      </Link>
      {resource.status !== "ready" ? (
        <QueryState resource={resource} />
      ) : (
        resource.data && (
          <>
            <div className="admission-card">
              <p className="attendee-summary">
                <strong>{resource.data.admitted_count} admitted</strong>
                <span>
                  {resource.data.confirmed_count} confirmed registrations
                </span>
              </p>
              <p className="small muted">
                {resource.data.event_status} · Entry:{" "}
                {eventDate(resource.data.opens_at)} –{" "}
                {eventDate(resource.data.closes_at)}
              </p>
              <Camera onToken={scanned} />
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit();
                }}
              >
                <Field
                  name="entry-code"
                  label="Entry code"
                  hint="Scan a QR or paste the student’s temporary code. Booking references cannot admit anyone."
                  error={invalid ? outcomes.invalid : undefined}
                >
                  <Input
                    id="entry-code"
                    value={token}
                    onChange={(e) => {
                      setToken(e.target.value);
                      setResult(null);
                    }}
                    maxLength={68}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? "entry-code-error" : undefined}
                  />
                </Field>
                <Button
                  type="submit"
                  disabled={action.busy || !token || !navigator.onLine}
                >
                  {action.busy ? "Validating…" : "Validate and check in"}
                </Button>
              </form>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setBefore(undefined);
                resource.reload();
              }}
            >
              Refresh check-ins
            </Button>
            <h2>Check-in history</h2>
            {resource.data.history.length ? (
              <ul className="attendee-list">
                {resource.data.history.map((row) => (
                  <li key={row.reference}>
                    <div>
                      <strong>{row.display_name}</strong>
                      <code>{row.reference}</code>
                      <span>{eventDate(row.checked_in_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No check-ins on this page.</p>
            )}
            {resource.data.history.length === 50 && (
              <Button
                variant="outline"
                onClick={() =>
                  setBefore(resource.data!.history.at(-1)!.checked_in_at)
                }
              >
                Older check-ins
              </Button>
            )}
          </>
        )
      )}
      <ActionError error={action.error} />
      {action.error && (
        <p className="small muted">
          The result is unconfirmed. Refresh history, or rescan the same code; a
          prior successful admission returns Already checked in.
        </p>
      )}
      {result && (
        <p
          className={`admission-result ${result.outcome === "admitted" ? "admission-success" : ""}`}
          role="status"
          tabIndex={-1}
          ref={heading}
        >
          {outcomes[result.outcome]}
          {result.reference && (
            <>
              <br />
              <code>{result.reference}</code>
            </>
          )}
          {result.checked_in_at && (
            <>
              <br />
              {eventDate(result.checked_in_at)}
            </>
          )}
        </p>
      )}
    </>
  );
}
