import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  LockKeyhole,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { useStore } from "../../app/store";
import {
  registrationSchema,
  departments,
  years,
  type RegistrationInput,
} from "../../lib/schemas";
import { registrationState } from "../../lib/domain";
import { eventDate, eventTime } from "../../lib/utils";
import { Button } from "../../components/ui/button";
import { Field, Input } from "../../components/ui/field";
import { EmptyState } from "../../components/empty-state";
import { Availability, Poster } from "../events/event-card";
import { useToast } from "../../components/toast";
export function Register() {
  const { eventId } = useParams();
  const { state, now, register: registerBooking } = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const lock = useRef(false);
  const [submitError, setSubmitError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegistrationInput>({
    resolver: zodResolver(registrationSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: {
      fullName: "",
      email: "",
      mobile: "",
      prn: "",
      department: "",
      year: "",
      note: "",
      consent: false,
    },
  });
  const event = state.events.find((e) => e.id === eventId);
  if (!event)
    return (
      <div className="container page">
        <EmptyState
          title="We couldn’t find that event."
          description="This registration link is missing or no longer valid. Find another experience in Discover."
        />
      </div>
    );
  const status = registrationState(event, state.registrations, now);
  if (status !== "open")
    return (
      <div className="container page">
        <EmptyState
          title={
            status === "full"
              ? "This one’s a full house."
              : "This event is in the books."
          }
          description={
            status === "full"
              ? "All demo places for this event have been filled. Explore another event to find your next thing."
              : "Registration closes when the event starts. Explore what is coming up next."
          }
        />
      </div>
    );
  const attrs = (name: keyof RegistrationInput, hint = false) => ({
    id: name,
    "aria-required": name !== "note",
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name]
      ? `${name}-error`
      : hint
        ? `${name}-hint`
        : undefined,
  });
  const submit = (values: RegistrationInput) => {
    if (lock.current) return;
    lock.current = true;
    setSubmitError("");
    try {
      const id = registerBooking(event.id, values);
      toast("You’re on the list. Your demo pass is ready.");
      navigate(`/bookings/${id}`, { replace: true });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Registration could not be saved. Please try again.",
      );
      lock.current = false;
    }
  };
  return (
    <div className="container page registration-page">
      <Link className="back-link" to={`/events/${event.id}`}>
        <ArrowLeft size={16} />
        Back to event
      </Link>
      <div className="registration-heading">
        <p className="eyebrow muted">A GOOD PLAN STARTS HERE</p>
        <h1>
          Save yourself a spot<span className="blue-dot">.</span>
        </h1>
        <p className="muted">A few details, and you’re part of the story.</p>
      </div>
      <div className="form-layout">
        <form
          noValidate
          onSubmit={(e) => {
            void handleSubmit(submit)(e);
          }}
          className="registration-form"
        >
          <div className="form-section-title">
            <span>01</span>
            <div>
              <h2>A little about you</h2>
              <p>Use sample details for this local demonstration.</p>
            </div>
          </div>
          <div className="form-grid">
            <Field
              label="Full name"
              name="fullName"
              error={errors.fullName?.message}
            >
              <Input
                {...register("fullName")}
                {...attrs("fullName")}
                placeholder="e.g. Aarya Deshmukh"
                autoComplete="name"
              />
            </Field>
            <Field
              label="Email address"
              name="email"
              error={errors.email?.message}
            >
              <Input
                {...register("email")}
                {...attrs("email")}
                placeholder="you@example.com"
                type="email"
                autoComplete="email"
              />
            </Field>
            <Field
              label="Mobile number"
              name="mobile"
              hint="10-digit Indian number; +91 is also supported."
              error={errors.mobile?.message}
            >
              <Input
                {...register("mobile")}
                {...attrs("mobile", true)}
                placeholder="e.g. 98765 43210"
                type="tel"
                autoComplete="tel"
              />
            </Field>
            <Field
              label="Student PRN"
              name="prn"
              hint="Your 12-digit student number, including leading zeros."
              error={errors.prn?.message}
            >
              <Input
                {...register("prn")}
                {...attrs("prn", true)}
                placeholder="e.g. 002026123456"
                inputMode="numeric"
                autoComplete="off"
              />
            </Field>
            <Field
              label="Department"
              name="department"
              error={errors.department?.message}
            >
              <select
                className="input"
                {...register("department")}
                {...attrs("department")}
              >
                <option value="">Select your department</option>
                {departments.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field
              label="Academic year"
              name="year"
              error={errors.year?.message}
            >
              <select
                className="input"
                {...register("year")}
                {...attrs("year")}
              >
                <option value="">Select your year</option>
                {years.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="note-field">
            <Field
              label="Anything we should know?"
              name="note"
              optional
              hint="Accessibility needs, a question, or a little hello. Up to 500 characters."
              error={errors.note?.message}
            >
              <textarea
                className="input"
                rows={3}
                {...register("note")}
                {...attrs("note", true)}
                placeholder="Let the hosts know…"
              />
            </Field>
          </div>
          <div className="consent-block">
            <label className="consent-label" htmlFor="consent">
              <input
                type="checkbox"
                {...register("consent")}
                {...attrs("consent")}
              />
              <span>
                I understand this is a <strong>local demo registration</strong>,
                not a real reservation. My details will be stored in this
                browser.
              </span>
            </label>
            {errors.consent && (
              <p className="field-error" id="consent-error" role="alert">
                {errors.consent.message}
              </p>
            )}
          </div>
          {submitError && (
            <div className="form-alert" role="alert">
              {submitError}
            </div>
          )}
          <div className="form-submit">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving your pass…" : "Confirm registration"}
              <ArrowRight size={17} />
            </Button>
            <span>
              <LockKeyhole size={13} />
              No payment required
            </span>
          </div>
          <p className="form-footnote">
            No emails, no account, no hidden fees. Your demo pass will appear on
            the next screen.
          </p>
        </form>
        <aside className="event-summary">
          <Poster event={event} />
          <div className="summary-body">
            <span className="category-tag static-tag">{event.category}</span>
            <h2>{event.title}</h2>
            <p>
              <CalendarDays size={16} />
              {eventDate(event.start)} · {eventTime(event.start)}
            </p>
            <p>
              <MapPin size={16} />
              {event.venue}
            </p>
            <div className="summary-availability">
              <Availability event={event} />
              <strong>Free</strong>
            </div>
            <ul className="summary-benefits">
              <li>
                <Check size={15} />
                Your own digital event pass
              </li>
              <li>
                <Check size={15} />
                Manage your spot in My bookings
              </li>
              <li>
                <Check size={15} />
                Cancel before the event starts
              </li>
            </ul>
            <div className="summary-demo">
              <ShieldCheck size={20} />
              <p>
                Just a demo. Your registration stays in this browser and doesn’t
                reserve a real event seat.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
