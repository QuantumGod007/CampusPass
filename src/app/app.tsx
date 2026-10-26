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
import { ProfileProvider } from "./profile";
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
            : pathname === "/account/profile"
              ? "Your student profile"
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
        path: "/campus",
        lazy: async () => ({
          Component: (await import("../features/campus/shared")).CampusLayout,
        }),
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import("../features/campus/events"))
                .CampusDiscover,
            }),
          },
          {
            path: "events/:eventId",
            lazy: async () => ({
              Component: (await import("../features/campus/events"))
                .CampusEventDetails,
            }),
          },
          {
            path: "bookings",
            lazy: async () => ({
              Component: (await import("../features/campus/bookings"))
                .CampusBookings,
            }),
          },
          {
            path: "bookings/:bookingId",
            lazy: async () => ({
              Component: (await import("../features/campus/bookings"))
                .CampusBookingDetails,
            }),
          },
          {
            path: "notifications",
            lazy: async () => ({
              Component: (await import("../features/campus/notifications"))
                .CampusNotifications,
            }),
          },
          {
            path: "organizer/:eventId/check-in",
            lazy: async () => ({
              Component: (await import("../features/campus/admission"))
                .CampusCheckin,
            }),
          },
          {
            path: "organizer",
            lazy: async () => ({
              Component: (await import("../features/campus/organizer"))
                .CampusOrganizer,
            }),
          },
        ],
      },
      {
        path: "/account/profile",
        lazy: async () => ({
          Component: (await import("../features/account/profile-page"))
            .ProfilePage,
        }),
      },
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
        <ProfileProvider>
          <StoreProvider>
            <ToastProvider>
              <RouterProvider router={router} />
            </ToastProvider>
          </StoreProvider>
        </ProfileProvider>
      </AuthProvider>
    </MotionConfig>
  );
}
