import { useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleUserRound,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../../app/auth";
import { useStudentProfile } from "../../app/profile";
import { Button } from "../../components/ui/button";
import { Field, Input } from "../../components/ui/field";
import { useToast } from "../../components/toast";

import {
  profileSchema,
  profileDepartments,
  profileYears,
  type ProfileValues,
} from "../../lib/profiles/schema";
import type { ProfileAccount } from "../../lib/profiles/repository";
import "./profile.css";

function ProfileForm({
  account,
  onSaved,
  onCancel,
}: {
  account: ProfileAccount;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const state = useStudentProfile();
  const toast = useToast();
  const lock = useRef(false);
  const profile = account.profile;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    mode: "onTouched",
    defaultValues: {
      displayName: profile?.display_name || "",
      prn: profile?.prn || "",
      department: profile?.department,
      academicYear: profile?.academic_year,
    },
  });
  const attrs = (name: keyof ProfileValues, hint = false) => ({
    id: `profile-${name}`,
    "aria-required": true,
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name]
      ? `profile-${name}-error`
      : hint
        ? `profile-${name}-hint`
        : undefined,
  });
  async function submit(values: ProfileValues) {
    if (lock.current) return;
    lock.current = true;
    try {
      await state.save(values);
      toast("Your student profile has been saved to your account.");
      onSaved();
      requestAnimationFrame(() =>
        document.getElementById("profile-overview-title")?.focus(),
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message =
        error instanceof Error
          ? error.message
          : "Your profile could not be saved. Please try again.";
      if (
        error &&
        typeof error === "object" &&
        "kind" in error &&
        error.kind === "conflict"
      )
        setError("prn", { message }, { shouldFocus: true });
      else setError("root", { message });
      lock.current = false;
    }
  }
  return (
    <form
      className="account-form"
      noValidate
      onSubmit={(event) => {
        void handleSubmit(submit)(event);
      }}
      aria-busy={isSubmitting || state.isSaving}
    >
      <fieldset disabled={isSubmitting || state.isSaving}>
        <legend className="sr-only">
          {profile ? "Edit student profile" : "Set up your student profile"}
        </legend>
        <div className="form-grid">
          <Field
            label="Display name"
            name="profile-displayName"
            error={errors.displayName?.message}
          >
            <Input
              {...register("displayName")}
              {...attrs("displayName")}
              autoComplete="name"
              maxLength={80}
              placeholder="e.g. Aarya Deshmukh"
            />
          </Field>
          <Field
            label="Student PRN"
            name="profile-prn"
            hint="12 digits, including leading zeros. This is self-declared, not enrollment verification."
            error={errors.prn?.message}
          >
            <Input
              {...register("prn")}
              {...attrs("prn", true)}
              inputMode="numeric"
              maxLength={12}
              autoComplete="off"
              placeholder="e.g. 002026123456"
            />
          </Field>
          <Field
            label="Department"
            name="profile-department"
            error={errors.department?.message}
          >
            <select
              className="input"
              {...register("department")}
              {...attrs("department")}
            >
              <option value="">Select your department</option>
              {profileDepartments.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Academic year"
            name="profile-academicYear"
            error={errors.academicYear?.message}
          >
            <select
              className="input"
              {...register("academicYear")}
              {...attrs("academicYear")}
            >
              <option value="">Select your year</option>
              {profileYears.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
        </div>
        {errors.root && (
          <p className="form-alert" role="alert">
            {errors.root.message}
          </p>
        )}
        <div className="account-form-actions">
          <Button type="submit">
            {isSubmitting || state.isSaving
              ? "Saving profile…"
              : profile
                ? "Save changes"
                : "Create student profile"}
            <ArrowRight size={16} />
          </Button>
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel editing
            </Button>
          )}
        </div>
      </fieldset>
    </form>
  );
}
function AccountWorkspace({ account }: { account: ProfileAccount }) {
  const [editing, setEditing] = useState(false);
  const { membership, profile, user } = account;
  const active = membership?.status === "active";
  return (
    <div className="account-grid">
      <section className="account-card">
        <div className="account-section-heading">
          <span className="account-symbol">
            <CircleUserRound size={24} />
          </span>
          <div>
            <p className="eyebrow muted">YOUR STUDENT IDENTITY</p>
            <h2 id="profile-overview-title" tabIndex={-1}>
              {profile ? "A little more you." : "Let’s get to know you."}
            </h2>
          </div>
          <span className={`account-status ${profile ? "complete" : ""}`}>
            {profile ? (
              <>
                <Check size={13} />
                Profile complete
              </>
            ) : (
              "Setup needed"
            )}
          </span>
        </div>
        <div className="account-email">
          <span className="eyebrow muted">ACCOUNT EMAIL</span>
          <strong>{user.email || "Email unavailable"}</strong>
          <span className="muted small">
            {user.emailConfirmedAt
              ? "Email confirmed by Supabase Auth"
              : "Email confirmation has not been recorded"}
          </span>
        </div>
        {profile && !editing ? (
          <>
            <dl className="profile-details">
              <div>
                <dt>Display name</dt>
                <dd>{profile.display_name}</dd>
              </div>
              <div>
                <dt>
                  Student PRN <span className="muted">· Self-declared</span>
                </dt>
                <dd>{profile.prn}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{profile.department}</dd>
              </div>
              <div>
                <dt>Academic year</dt>
                <dd>{profile.academic_year}</dd>
              </div>
            </dl>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit profile
              <ArrowRight size={15} />
            </Button>
            <p className="account-persistence">
              <LockKeyhole size={13} />
              Saved in your account database. Available when you sign in on
              another browser.
            </p>
          </>
        ) : (
          <>
            <p className="muted account-form-intro">
              {profile
                ? "Update your own details. Institution access and roles are managed separately."
                : "These details belong to your real account. They are never copied from demonstration bookings."}
            </p>
            <ProfileForm
              key={profile?.updated_at || user.id}
              account={account}
              onSaved={() => setEditing(false)}
              onCancel={profile ? () => setEditing(false) : undefined}
            />
          </>
        )}
      </section>
      <aside className="account-membership">
        <ShieldCheck size={25} />
        <p className="eyebrow muted">INSTITUTION ASSOCIATION</p>
        <h2>
          {active
            ? membership.institution_name
            : membership?.institution_name || "Not provisioned yet."}
        </h2>
        <span className={`account-status ${active ? "complete" : ""}`}>
          {membership
            ? `Membership ${membership.status}`
            : "Enrollment unverified"}
        </span>
        <p>
          {active
            ? "A trusted administrator has provisioned this student membership. Your PRN remains self-declared and is not evidence of enrollment."
            : "Institution membership requires trusted provisioning. Entering a PRN or an email address does not approve enrollment or grant access."}
        </p>
        <p className="small muted">
          {membership?.expires_at
            ? `Membership expiry: ${new Date(membership.expires_at).toLocaleString()}. `
            : ""}
          Organizer access requires a trusted operator grant. Administrator
          access is unavailable.
        </p>
        <div className="account-demo-boundary">
          <strong>Your demo stays a demo.</strong>
          <p>
            The original demo’s saved events, bookings, passes, and Organizer studio use fictional browser-local data. Campus events and registrations are stored separately.
          </p>
          <Link className="text-link" to="/bookings">
            View demo bookings
            <ArrowRight size={14} />
          </Link>
        </div>
      </aside>
    </div>
  );
}
export function ProfilePage() {
  const auth = useAuth();
  const state = useStudentProfile();
  if (auth.status === "unauthenticated")
    return <Navigate to="/login?next=%2Faccount%2Fprofile" replace />;
  return (
    <div className="container page account-page">
      <Link className="back-link" to="/">
        <ArrowLeft size={16} />
        Back to Discover
      </Link>
      <div className="page-heading">
        <p className="eyebrow muted">A PLACE FOR THE REAL YOU</p>
        <h1>
          Your student profile<span className="blue-dot">.</span>
        </h1>
        <p className="muted">
          Your identity, thoughtfully kept separate from the campus demo.
        </p>
      </div>
      {auth.status === "disabled" ? (
        <section className="account-card">
          <h2>Keep exploring.</h2>
          <p>
            Student accounts aren’t enabled here. The browser-local event demo
            is fully available.
          </p>
          <Button asChild>
            <Link to="/">
              Explore the demo
              <ArrowRight size={16} />
            </Link>
          </Button>
        </section>
      ) : auth.status === "error" ? (
        <section className="account-card" role="alert">
          <h2>Let’s reconnect.</h2>
          <p>
            Your account session could not be restored. Try again to continue.
          </p>
          <Button onClick={auth.retry}>Try again</Button>
        </section>
      ) : auth.status === "loading" ||
        auth.isSigningOut ||
        state.status === "loading" ||
        state.status === "disabled" ? (
        <section className="account-card account-loading" role="status">
          <LoaderCircle size={24} />
          <p>
            {auth.isSigningOut
              ? "Signing out…"
              : "Loading your account profile…"}
          </p>
        </section>
      ) : state.status === "error" ? (
        <section className="account-card" role="alert">
          <h2>Your profile needs another try.</h2>
          <p>{state.error?.message}</p>
          <div className="account-form-actions">
            <Button onClick={state.reload}>Try again</Button>
            {state.error?.kind === "session" && (
              <Button variant="outline" onClick={() => void auth.signOut()}>
                Sign out and sign in again
              </Button>
            )}
          </div>
        </section>
      ) : state.account ? (
        <AccountWorkspace key={state.account.user.id} account={state.account} />
      ) : null}
    </div>
  );
}
