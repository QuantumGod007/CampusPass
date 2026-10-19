import { useEffect } from "react";
import {
  createBrowserRouter,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import { MotionConfig } from "motion/react";
import { StoreProvider } from "./store";
import { ToastProvider } from "../components/toast";
import { Layout } from "../components/layout";
import { Discover } from "../features/events/discover";
import { EmptyState } from "../components/empty-state";
import { RouteError } from "../components/route-error";
import { AuthProvider } from "./auth";
function AppLayout() {
  const { pathname } = useLocation();
  useEffect(() => {
    const page =
      pathname === "/"
        ? "Discover what’s happening."
        : pathname === "/login"
          ? "Sign in"
          : pathname === "/signup"
            ? "Create your account"
            : pathname === "/auth/callback"
              ? "Confirm your account"
              : pathname.includes("/register")
                ? "Save your spot"
                : pathname.startsWith("/bookings/")
                  ? "Your event pass"
                  : pathname === "/bookings"
                    ? "My bookings"
                    : pathname === "/saved"
                      ? "Saved events"
                      : pathname === "/organizer"
                        ? "Organizer studio"
                        : "Your next campus story";
    document.title = `CampusPass — ${page}`;
  }, [pathname]);
  return <Layout />;
}
const router = createBrowserRouter([
  {
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      { path: "/", element: <Discover /> },
      {
        path: "/login",
        lazy: async () => ({
          Component: (await import("../features/auth/auth-page")).Login,
        }),
      },
      {
        path: "/signup",
        lazy: async () => ({
          Component: (await import("../features/auth/auth-page")).Signup,
        }),
      },
      {
        path: "/auth/callback",
        lazy: async () => ({
          Component: (await import("../features/auth/auth-page")).AuthCallback,
        }),
      },
      {
        path: "/events/:eventId",
        lazy: async () => ({
          Component: (await import("../features/events/event-details"))
            .EventDetails,
        }),
      },
      {
        path: "/events/:eventId/register",
        lazy: async () => ({
          Component: (await import("../features/registration/register"))
            .Register,
        }),
      },
      {
        path: "/bookings",
        lazy: async () => ({
          Component: (await import("../features/bookings/bookings")).Bookings,
        }),
      },
      {
        path: "/bookings/:bookingId",
        lazy: async () => ({
          Component: (await import("../features/bookings/booking-pass"))
            .BookingPass,
        }),
      },
      {
        path: "/saved",
        lazy: async () => ({
          Component: (await import("../features/events/saved")).Saved,
        }),
      },
      {
        path: "/organizer",
        lazy: async () => ({
          Component: (await import("../features/organizer/organizer"))
            .Organizer,
        }),
      },
      {
        path: "*",
        element: (
          <div className="container page">
            <EmptyState
              title="A little off the campus map."
              description="That page doesn’t exist. Let’s find you something worth showing up for."
            />
          </div>
        ),
      },
    ],
  },
]);
export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <StoreProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </StoreProvider>
      </AuthProvider>
    </MotionConfig>
  );
}
