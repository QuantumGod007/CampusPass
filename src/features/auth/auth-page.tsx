import { useEffect, useRef, useState } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  MailCheck,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../../app/auth";
import {
  authErrorMessage,
  loginSchema,
  safeAuthRedirect,
  signupSchema,
  type LoginValues,
  type SignupValues,
} from "../../lib/auth/forms";
import { Field, Input } from "../../components/ui/field";
import { Button } from "../../components/ui/button";
import { AuthShell } from "./auth-shell";

function useActiveForm() {
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return active;
}

function PasswordField({
  id,
  label = "Password",
  registration,
  error,
  hint,
  autoComplete,
}: {
  id: string;
  label?: string;
  registration: UseFormRegisterReturn;
  error?: string;
  hint?: string;
  autoComplete: "current-password" | "new-password";
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field name={id} label={label} error={error} hint={hint}>
      <div className="auth-password-control">
        <Input
          {...registration}
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          aria-required="true"
          aria-invalid={!!error}
          aria-describedby={
            error ? `${id}-error` : hint ? `${id}-hint` : undefined
          }
        />
        <button
          type="button"
          className="icon-button"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </Field>
  );
}

function AuthNotice() {
  const auth = useAuth();
  const loading = auth.status === "loading";
  const disabled = auth.status === "disabled";
  return (
    <AuthShell
      title={
        loading
          ? "A moment, please"
          : disabled
            ? "Keep exploring"
            : "Let’s reconnect"
      }
      description={
        loading
          ? "Checking your account session."
          : disabled
            ? "Student sign-in isn’t enabled here. The campus demo is still yours to explore."
            : "Your account connection needs another try."
      }
    >
      <div
        className="auth-notice"
        role={loading ? "status" : disabled ? "note" : "alert"}
      >
        {loading ? (
          <LoaderCircle className="auth-spinner" size={25} />
        ) : (
          <ShieldCheck size={25} />
        )}
        <p>
          {loading
            ? "You’ll be ready in a moment."
            : disabled
              ? "Browse events, save favorites, and try demo bookings. No account is needed."
              : "Student sign-in is temporarily unavailable. Try again, or keep exploring the campus demo."}
        </p>
      </div>
      {auth.status === "error" && (
        <Button onClick={auth.retry}>
          Try again <ArrowRight size={16} />
        </Button>
      )}
      <Link className="auth-text-link" to="/">
        Continue exploring
      </Link>
    </AuthShell>
  );
}

function LoginForm() {
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = useActiveForm();
  const lock = useRef(false);
  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    mode: "onTouched",
    defaultValues: { email: "", password: "" },
  });
  async function submit(values: LoginValues) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const { getSupabaseClient } = await import("../../lib/auth/client");
      const client = getSupabaseClient();
      if (!client) throw new Error("Authentication is disabled");
      const { data, error: failure } =
        await client.auth.signInWithPassword(values);
      if (failure) throw failure;
      if (!data.session) throw new Error("No authenticated session returned");
      if (active.current) {
        resetField("password");
        setComplete(true);
      }
    } catch (failure) {
      if (active.current) setError(authErrorMessage(failure, "login"));
      lock.current = false;
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <form
      className="auth-form"
      noValidate
      aria-busy={isSubmitting || busy || complete}
      onSubmit={(event) => {
        void handleSubmit(submit)(event);
      }}
    >
      <fieldset disabled={isSubmitting || busy || complete}>
        <legend className="sr-only">
          Sign in with your email and password
        </legend>
        <Field
          name="login-email"
          label="Email address"
          error={errors.email?.message}
        >
          <Input
            {...register("email")}
            id="login-email"
            type="email"
            autoComplete="username"
            placeholder="you@example.com"
            aria-required="true"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "login-email-error" : undefined}
          />
        </Field>
        <PasswordField
          id="login-password"
          registration={register("password")}
          error={errors.password?.message}
          autoComplete="current-password"
        />
        {error && (
          <p className="form-alert" role="alert">
            {error}
          </p>
        )}
        {complete && (
          <p className="auth-success" role="status">
            You’re signed in. Opening your next page…
          </p>
        )}
        <Button type="submit" className="full-width">
          {isSubmitting || busy || complete ? "Signing in…" : "Sign in"}
          <ArrowRight size={17} />
        </Button>
      </fieldset>
      <p className="auth-form-note">
        <LockKeyhole size={14} /> Stay signed in on this browser. Sign out on
        shared devices.
      </p>
    </form>
  );
}

function SignupForm({ loginUrl }: { loginUrl: string }) {
  const [error, setError] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = useActiveForm();
  const lock = useRef(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    mode: "onTouched",
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });
  async function submit(values: SignupValues) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const { getSupabaseClient } = await import("../../lib/auth/client");
      const client = getSupabaseClient();
      if (!client) throw new Error("Authentication is disabled");
      const { data, error: failure } = await client.auth.signUp({
        email: values.email,
        password: values.password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (failure) throw failure;
      if (active.current) {
        reset();
        if (data.session) setComplete(true);
        else setConfirmationEmail(values.email);
      }
    } catch (failure) {
      if (active.current) setError(authErrorMessage(failure, "signup"));
      lock.current = false;
    } finally {
      if (active.current) setBusy(false);
    }
  }
  if (confirmationEmail)
    return (
      <div className="auth-confirmation" role="status">
        <span className="auth-confirmation-icon">
          <MailCheck size={28} />
        </span>
        <h2>Check your inbox.</h2>
        <p>
          If this address can be registered, a confirmation link will be sent to{" "}
          <strong>{confirmationEmail}</strong>. Open it in this browser to
          finish signing up.
        </p>
        <p>
          Already have an account? Sign in instead. If no message arrives, check
          spam or try again later.
        </p>
        <Button asChild className="full-width">
          <Link to={loginUrl}>
            Back to sign in <ArrowRight size={16} />
          </Link>
        </Button>
        <button
          className="auth-text-link"
          onClick={() => {
            setConfirmationEmail("");
            lock.current = false;
          }}
        >
          Use a different email
        </button>
      </div>
    );
  return (
    <form
      className="auth-form"
      noValidate
      aria-busy={isSubmitting || busy || complete}
      onSubmit={(event) => {
        void handleSubmit(submit)(event);
      }}
    >
      <fieldset disabled={isSubmitting || busy || complete}>
        <legend className="sr-only">Create your student account</legend>
        <Field
          name="signup-email"
          label="Email address"
          error={errors.email?.message}
        >
          <Input
            {...register("email")}
            id="signup-email"
            type="email"
            autoComplete="username"
            placeholder="you@example.com"
            aria-required="true"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "signup-email-error" : undefined}
          />
        </Field>
        <PasswordField
          id="signup-password"
          registration={register("password")}
          error={errors.password?.message}
          hint="At least 8 characters. A longer, unique passphrase works well."
          autoComplete="new-password"
        />
        <PasswordField
          id="signup-confirm"
          label="Confirm password"
          registration={register("confirmPassword")}
          error={errors.confirmPassword?.message}
          autoComplete="new-password"
        />
        {error && (
          <p className="form-alert" role="alert">
            {error}
          </p>
        )}
        {complete && (
          <p className="auth-success" role="status">
            Your account is ready. Opening your next page…
          </p>
        )}
        <Button type="submit" className="full-width">
          {isSubmitting || busy || complete
            ? "Creating your account…"
            : "Create student account"}
          <ArrowRight size={17} />
        </Button>
      </fieldset>
      <p className="auth-form-note">
        <ShieldCheck size={15} /> Your account is separate from local demo
        bookings.
      </p>
    </form>
  );
}

function AuthPage({ signup }: { signup: boolean }) {
  const auth = useAuth();
  const [params] = useSearchParams();
  const next = safeAuthRedirect(params.get("next"));
  const query = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
  if (["loading", "disabled", "error"].includes(auth.status))
    return <AuthNotice />;
  if (auth.status === "authenticated") return <Navigate to={next} replace />;
  return (
    <AuthShell
      title={signup ? "Find your people" : "Good to see you"}
      description={
        signup
          ? "A student account for everything that comes next."
          : "Sign in to your CampusPass student account."
      }
    >
      <div className="auth-switch">
        <span>
          {signup ? "Already part of the story?" : "New around here?"}
        </span>
        <Link to={`${signup ? "/login" : "/signup"}${query}`}>
          {signup ? "Sign in" : "Create an account"} <ArrowRight size={14} />
        </Link>
      </div>
      {signup ? <SignupForm loginUrl={`/login${query}`} /> : <LoginForm />}
      <div className="auth-demo-note">
        Just exploring? <Link to="/">The demo is open to everyone.</Link>
      </div>
    </AuthShell>
  );
}

export function Login() {
  return <AuthPage signup={false} />;
}
export function Signup() {
  return <AuthPage signup />;
}

export function AuthCallback() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [linkError] = useState(() => {
    const params = new URLSearchParams(
      `${location.search.slice(1)}&${location.hash.slice(1)}`,
    );
    return params.has("error") || params.has("error_code");
  });
  const failed =
    linkError || auth.status === "error" || auth.status === "unauthenticated";
  useEffect(() => {
    // Wait for SDK initialization before removing one-time callback parameters.
    if (
      auth.status !== "loading" &&
      (failed || auth.status === "disabled") &&
      (location.search || location.hash)
    ) {
      navigate("/auth/callback", { replace: true });
    }
  }, [auth.status, failed, location.search, location.hash, navigate]);
  if (auth.status === "loading" || auth.status === "disabled")
    return <AuthNotice />;
  if (!failed && auth.status === "authenticated")
    return <Navigate to="/" replace />;
  return (
    <AuthShell
      title="Let’s finish signing in"
      description="This confirmation link couldn’t finish your account session."
    >
      <div className="auth-notice" role="alert">
        <MailCheck size={26} />
        <p>
          The link may have expired, been used already, or opened in a different
          browser. Your email may already be confirmed; try signing in with your
          email and password.
        </p>
      </div>
      <Button asChild className="full-width">
        <Link to="/login">
          Go to sign in <ArrowRight size={16} />
        </Link>
      </Button>
      <p className="auth-form-note">
        Open future confirmation links in the browser where you signed up.
      </p>
    </AuthShell>
  );
}
