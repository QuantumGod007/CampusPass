import pg from "pg";
import { createClient } from "@supabase/supabase-js";
export function databasePool() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value)
    throw new Error(
      "TEST_DATABASE_URL is required. Use a disposable local database.",
    );
  const url = new URL(value);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !["54322", "55437"].includes(url.port)
  )
    throw new Error(
      "Database tests are restricted to isolated local test ports.",
    );
  return new pg.Pool({ connectionString: value });
}
export function apiEnvironment() {
  const url = process.env.TEST_SUPABASE_URL;
  const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error(
      "The isolated Supabase URL and publishable key are required.",
    );
  const parsed = new URL(url);
  if (
    !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
    parsed.port !== "54321"
  )
    throw new Error(
      "API tests may only use the isolated local Supabase stack.",
    );
  return { url, key };
}
export function apiClient() {
  const { url, key } = apiEnvironment();
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
// Local SMTP capture only. No production inboxes or email delivery providers.
export async function confirmationLink(email) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const response = await fetch("http://127.0.0.1:54324/api/v1/messages");
    if (!response.ok)
      throw new Error("The isolated Mailpit API is unavailable.");
    const inbox = await response.json();
    const message = inbox.messages?.find((item) =>
      item.To?.some((to) => to.Address === email),
    );
    if (message) {
      const body = await fetch(
        `http://127.0.0.1:54324/api/v1/message/${encodeURIComponent(message.ID)}`,
      ).then((r) => r.json());
      const match = `${body.HTML || ""}\n${body.Text || ""}`.match(
        /https?:\/\/[^\s"<>]+\/auth\/v1\/verify\?[^\s"<>]+/,
      );
      if (!match)
        throw new Error(
          "Confirmation message does not contain an Auth verification link.",
        );
      const link = new URL(match[0].replaceAll("&amp;", "&"));
      if (
        !["127.0.0.1", "localhost"].includes(link.hostname) ||
        link.port !== "54321"
      )
        throw new Error("Refusing to follow a non-local confirmation link.");
      return link.href;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("No confirmation email arrived in isolated Mailpit.");
}
