import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CircleUserRound, LogOut } from "lucide-react";
import { useAuth } from "../app/auth";
import { safeAuthRedirect } from "../lib/auth/forms";
import { useToast } from "./toast";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import "../features/auth/auth.css";

export function AuthNavigation({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const auth = useAuth();
  const location = useLocation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  if (auth.status === "disabled" || auth.status === "loading") return null;
  const next = safeAuthRedirect(location.pathname);
  async function logout() {
    const success = await auth.signOut();
    setOpen(false);
    // The SDK may remove the account trigger before the dialog restores focus.
    requestAnimationFrame(() => {
      document
        .getElementById(mobile ? "student-sign-in-mobile" : "student-sign-in")
        ?.focus();
    });
    if (success) {
      onNavigate?.();
      toast("Signed out on this browser.");
    } else
      toast(
        "Sign-out could not be confirmed with the server. Please try again.",
        true,
      );
  }
  if (!auth.user)
    return (
      <Link
        id={mobile ? "student-sign-in-mobile" : "student-sign-in"}
        className={mobile ? "auth-mobile-link" : "auth-nav-link"}
        to={`/login${next === "/" ? "" : `?next=${encodeURIComponent(next)}`}`}
        onClick={onNavigate}
      >
        Sign in
      </Link>
    );
  if (mobile)
    return (
      <div className="auth-mobile-account">
        <span>{auth.user.email}</span>
        <button
          onClick={() => {
            void logout();
          }}
          disabled={auth.isSigningOut}
        >
          <LogOut size={16} />
          {auth.isSigningOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    );
  return (
    <>
      <button
        className="auth-nav-link"
        aria-label="Open account menu"
        onClick={() => setOpen(true)}
      >
        <CircleUserRound size={18} />
        <span>Account</span>
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Your CampusPass account"
        description="You’re signed in on this browser."
      >
        <p className="auth-account-email">{auth.user.email}</p>
        <p className="auth-account-note">
          Your account and local demo bookings are separate. Signing out keeps
          your saved demo events and bookings in this browser.
        </p>
        {auth.error && (
          <p role="alert" className="form-alert">
            {auth.error}
          </p>
        )}
        <Button
          onClick={() => {
            void logout();
          }}
          disabled={auth.isSigningOut}
        >
          <LogOut size={16} />
          {auth.isSigningOut ? "Signing out…" : "Sign out"}
        </Button>
      </Dialog>
    </>
  );
}
