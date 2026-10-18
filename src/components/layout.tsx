import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ArrowUpRight, Bookmark, Info, Menu, Ticket, X } from "lucide-react";
import { useStore } from "../app/store";
import { Button } from "./ui/button";
import { ConfirmDialog, Dialog } from "./ui/dialog";
import { useToast } from "./toast";
export function Wordmark() {
  return (
    <span className="wordmark">
      <span className="brand-symbol">
        <Ticket size={22} strokeWidth={2} />
      </span>
      campuspass<span className="brand-dot">.</span>
    </span>
  );
}
export function Layout() {
  const [menu, setMenu] = useState(false);
  const [info, setInfo] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const { state, notice, dismissNotice, reset } = useStore();
  const toast = useToast();
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [location.pathname]);
  const navigation = (
    <>
      <NavLink to="/" end onClick={() => setMenu(false)}>
        Discover
      </NavLink>
      <NavLink to="/bookings" onClick={() => setMenu(false)}>
        My bookings
      </NavLink>
      <NavLink to="/saved" onClick={() => setMenu(false)}>
        Saved events
        {state.bookmarks.length > 0 && (
          <span className="nav-count">{state.bookmarks.length}</span>
        )}
      </NavLink>
    </>
  );
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" aria-label="CampusPass home">
            <Wordmark />
          </Link>
          <nav className="desktop-nav" aria-label="Main navigation">
            {navigation}
          </nav>
          <div className="header-actions">
            <NavLink className="studio-link" to="/organizer">
              Organizer studio <ArrowUpRight size={15} />
            </NavLink>
            <button className="demo-pill" onClick={() => setInfo(true)}>
              <span />
              Demo mode
            </button>
            <button
              className="mobile-menu icon-button"
              onClick={() => setMenu(true)}
              aria-label="Open navigation"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </header>
      {notice && (
        <div className="storage-notice" role="alert">
          <Info size={18} />
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss storage notice"
            onClick={dismissNotice}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container footer-main">
          <div>
            <Link to="/" aria-label="CampusPass home">
              <Wordmark />
            </Link>
            <p>A little less scrolling. A little more showing up.</p>
          </div>
          <div className="footer-right">
            <span>Made for life beyond the classroom.</span>
            <button onClick={() => setInfo(true)}>
              <Info size={14} /> Your browser. Your demo.
            </button>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>
            © {new Date().getFullYear()} CampusPass · A student project,
            thoughtfully built.
          </span>
          <button onClick={() => setResetOpen(true)}>
            Reset demo data <ArrowUpRight size={12} />
          </button>
        </div>
      </footer>
      <Dialog
        open={menu}
        onOpenChange={setMenu}
        title="Find your next thing"
        className="mobile-nav-dialog"
      >
        <nav aria-label="Mobile navigation">
          {navigation}
          <NavLink to="/organizer" onClick={() => setMenu(false)}>
            Organizer studio <ArrowUpRight size={18} />
          </NavLink>
        </nav>
        <p className="muted">
          <Bookmark size={16} /> Saved in this browser, just for you.
        </p>
      </Dialog>
      <Dialog
        open={info}
        onOpenChange={setInfo}
        title="A real experience. A local demo."
        description="CampusPass is a frontend React demonstration."
      >
        <div className="prose">
          <p>
            Events are fictional. Bookings, saved events, and organizer changes
            stay in this browser’s local storage. They are not real reservations
            and are not synchronized across people or devices.
          </p>
          <p>
            No email is sent, no payment is collected, and passes have no
            external verification. Use sample student details when trying the
            forms.
          </p>
          <p>
            Resetting the demo clears your local bookings, bookmarks, and
            created events, then restores fresh upcoming events.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setInfo(false);
            setResetOpen(true);
          }}
        >
          Reset demo data
        </Button>
      </Dialog>
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Start with a fresh campus?"
        description="This clears all bookings, saved events, and organizer events from this browser. The 12 demo events will be restored with new upcoming dates."
        confirmLabel="Reset demo"
        onConfirm={() => {
          reset();
          toast("Your demo has been reset. A fresh start awaits.");
        }}
      />
    </>
  );
}
