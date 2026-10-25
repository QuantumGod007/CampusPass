import { z } from "zod";

const email = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .max(254, "Keep your email address under 255 characters.")
  .email("Enter a valid email address.");

export const loginSchema = z.object({
  email,
  // Existing accounts can have passwords that predate the signup policy.
  password: z.string().min(1, "Enter your password."),
});

export const signupSchema = z
  .object({
    email,
    password: z
      .string()
      .min(8, "Use at least 8 characters.")
      .refine(
        (value) => new TextEncoder().encode(value).length <= 72,
        "Use no more than 72 bytes for your password.",
      ),
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Your passwords don’t match.",
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type SignupValues = z.infer<typeof signupSchema>;

// Only existing student-facing demo routes are valid destinations. No absolute
// URLs, encoded paths, auth loops, or implicit organizer permissions.
export function safeAuthRedirect(value: string | null | undefined): string {
  if (
    !value ||
    !/^\/(?:campus(?:\/(?:organizer|bookings(?:\/[0-9a-f-]{36})?|events\/[0-9a-f-]{36}))?|account\/profile|saved|bookings(?:\/[A-Za-z0-9_-]+)?|events\/[A-Za-z0-9_-]+(?:\/register)?)?$/.test(
      value,
    )
  )
    return "/";
  return value;
}

export function authErrorMessage(error: unknown, action: "login" | "signup") {
  const details = error && typeof error === "object" ? error : {};
  const code = "code" in details ? details.code : null;
  const status = "status" in details ? details.status : null;
  if (code === "email_not_confirmed")
    return "Confirm your email before signing in. Check the message sent when you signed up.";
  if (
    status === 429 ||
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit"
  )
    return "Too many attempts. Please wait a moment and try again.";
  if (code === "weak_password")
    return "Choose a stronger password that meets your campus account’s password requirements.";
  if (code === "invalid_credentials")
    return "Your email or password is incorrect. Check both and try again.";
  if (code === "user_already_exists")
    return "We couldn’t create this account. Try signing in, or use a different email.";
  return action === "login"
    ? "We couldn’t sign you in. Check your connection and try again."
    : "We couldn’t create your account. Please try again in a moment.";
}
