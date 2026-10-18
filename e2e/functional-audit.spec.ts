import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createSeed } from "../src/data/seed";
import { makeRegistration } from "../src/lib/domain";
import { student, organizerInput } from "../src/tests/fixtures";
import { localDateInput } from "../src/lib/utils";
import type { AppState } from "../src/types";
import { normalizeMobile } from "../src/lib/schemas";

const key = "campuspass.demo.v1";
test.use({ timezoneId: "Asia/Kolkata" });
async function seed(page: Page, state: AppState) {
  await page.addInitScript(
    ({ key, state }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(state));
    },
    { key, state },
  );
}
async function fillRegistration(page: Page) {
  for (const [label, value] of Object.entries({
    "Full name": student.fullName,
    "Email address": student.email,
    "Mobile number": normalizeMobile(student.mobile),
    "Student PRN": student.prn,
  }))
    await page.getByLabel(label, { exact: true }).fill(value);
  await page
    .getByLabel("Department", { exact: true })
    .selectOption(student.department);
  await page
    .getByLabel("Academic year", { exact: true })
    .selectOption(student.year);
  await page.getByRole("checkbox").check();
}
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  for (const element of await page
    .locator(".dialog-content, .toast, .confirmation-icon")
    .all())
    await expect(element).toHaveCSS("opacity", "1");
}

test("upcoming date filters exclude events that already started today", async ({
  page,
}) => {
  const now = new Date("2030-10-18T12:00:00Z");
  await page.clock.install({ time: now });
  const state = createSeed(now);
  state.events[0].start = new Date(now.getTime() - 3600000).toISOString();
  state.events[0].end = new Date(now.getTime() + 3600000).toISOString();
  await seed(page, state);
  await page.goto("/");
  await page.getByLabel("Search events", { exact: true }).fill("BuildFest");
  for (const date of ["week", "month"]) {
    await page.getByLabel("Filter by date").selectOption(date);
    await expect(page.getByTestId("event-card")).toHaveCount(0);
  }
  await page.getByLabel("Filter by date").selectOption("past");
  await expect(page.getByTestId("event-card")).toHaveCount(1);
});

test("organizer creates one event when two submissions arrive before a render", async ({
  page,
}) => {
  await page.goto("/organizer");
  await page
    .getByRole("button", { name: "Create an event", exact: true })
    .click();
  const values = organizerInput();
  for (const [label, value] of Object.entries({
    "Event title": values.title,
    "Organizer name": values.organizer,
    "The story behind it": values.description,
    Venue: values.venue,
    Capacity: values.capacity,
    "Starts at": localDateInput(values.start),
    "Ends at": localDateInput(values.end),
  }))
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.locator(".organizer-form").evaluate((form) => {
    (form as HTMLFormElement).requestSubmit();
    (form as HTMLFormElement).requestSubmit();
  });
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".organizer-table tbody tr")).toHaveCount(1);
  expect(
    await page.evaluate(
      (key) =>
        (JSON.parse(localStorage.getItem(key)!) as AppState).events.length,
      key,
    ),
  ).toBe(13);
});

test("saved events synchronize across tabs and clearing storage clears stale records", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const other = await context.newPage();
  await other.goto("/saved");
  await page
    .getByRole("button", { name: "Save Design After Dark", exact: true })
    .click();
  await expect(other.getByTestId("event-card")).toHaveCount(1);
  await page.evaluate(() => localStorage.clear());
  await expect(other.getByTestId("event-card")).toHaveCount(0);
  await expect(
    other.getByRole("heading", { name: "Keep a little curiosity for later." }),
  ).toBeVisible();
  await other.reload();
  await expect(other.getByTestId("event-card")).toHaveCount(0);
});

test("booking search trims input, supports holder/reference searches and past-event records", async ({
  page,
}) => {
  const booked = makeRegistration(createSeed(), "buildfest", student);
  await seed(page, booked.state);
  await page.goto("/bookings");
  for (const query of [
    "   buildfest  ",
    "aarya",
    booked.registration.id.toLowerCase(),
  ]) {
    await page.getByLabel("Search bookings").fill(query);
    await expect(page.locator(".booking-row")).toHaveCount(1);
  }
  await page.getByLabel("Search bookings").fill("no matching plan");
  await expect(
    page.getByRole("heading", { name: "No plans by that name." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear booking search" }).click();
  await expect(page.locator(".booking-row")).toHaveCount(1);
  await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key)!) as AppState;
    const event = state.events.find((e) => e.id === "buildfest")!;
    event.start = new Date(Date.now() - 86400000).toISOString();
    event.end = new Date(Date.now() - 3600000).toISOString();
    localStorage.setItem(key, JSON.stringify(state));
  }, key);
  await page.reload();
  await expect(page.locator(".booking-row")).toHaveCount(0);
  await page.getByRole("button", { name: /^Past events/ }).click();
  await expect(page.locator(".booking-row")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Cancel registration", exact: true }),
  ).toHaveCount(0);
});

test("blocked storage writes show an honest notice while allowing a session booking", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage full", "QuotaExceededError");
    };
  });
  await page.goto("/events/buildfest/register");
  await expect(page.getByRole("alert")).toContainText("only for this session");
  await fillRegistration(page);
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await expect(
    page.getByRole("heading", { name: "You’re on the list." }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("only for this session");
  await page
    .getByRole("link", { name: "View my bookings", exact: true })
    .click();
  await expect(page.locator(".booking-row")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".booking-row")).toHaveCount(0);
});

for (const width of [390, 320]) {
  test(`registration, pass, print layout and cancellation work at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/events/buildfest/register");
    await page.getByRole("button", { name: "Confirm registration" }).click();
    await expect(page.getByLabel("Full name", { exact: true })).toBeFocused();
    await fillRegistration(page);
    await page.getByRole("button", { name: "Confirm registration" }).click();
    await expect(
      page.getByRole("heading", { name: "You’re on the list." }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".digital-pass")).toBeVisible();
    await expect(page.locator(".site-header")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Print demo pass" }),
    ).not.toBeVisible();
    await expect(page.locator(".pass-disclaimer")).toContainText(
      "Not a real reservation",
    );
    await page.emulateMedia({ media: "screen" });
    await page
      .getByRole("link", { name: "View my bookings", exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Cancel registration", exact: true })
      .click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel registration", exact: true })
      .click();
    await page.getByRole("button", { name: /^Cancelled/ }).click();
    await page.getByRole("link", { name: "View record" }).click();
    await expect(
      page.getByRole("button", { name: "Print demo pass" }),
    ).toBeDisabled();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "This plan has changed." }),
    ).toBeVisible();
    await page.goto("/events/buildfest");
    await expect(page.locator(".registration-card")).toContainText(
      "Only 12 spots left",
    );
  });
}

test("clipboard denial reports a useful error without losing the event page", async ({
  page,
}) => {
  await page.goto("/events/buildfest");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Denied");
        },
      },
    });
  });
  await page.getByRole("button", { name: "Copy event link" }).click();
  await expect(page.getByRole("status")).toContainText(
    "copy the URL from your address bar",
  );
  await expect(
    page.getByRole("heading", { name: "BuildFest Hackathon", exact: true }),
  ).toBeVisible();
});

test("event artwork has a working fallback without affecting saving or navigation", async ({
  page,
}) => {
  await page.route("**/posters/design.svg", (route) => route.abort());
  await page.goto("/events/design-after-dark");
  const poster = page.locator(".detail-cover img");
  await expect(poster).toHaveAttribute("src", "/posters/build.svg");
  await expect
    .poll(() =>
      poster.evaluate((img) => (img as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Save Design After Dark", exact: true })
    .click();
  await page.goto("/saved");
  await expect(page.getByTestId("event-card")).toHaveCount(1);
});

test("all principal deep links refresh correctly in the production SPA", async ({
  page,
  request,
}) => {
  for (const route of [
    "/",
    "/events/buildfest",
    "/events/buildfest/register",
    "/bookings",
    "/saved",
    "/organizer",
  ]) {
    const response = await request.get(route);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/html");
    await page.goto(route);
    await page.reload();
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByText("Unexpected Application Error!")).toHaveCount(
      0,
    );
  }
  expect(
    (await request.get("/posters/design.svg")).headers()["content-type"],
  ).toContain("image/svg+xml");
});

test("mobile validation errors and organizer errors pass accessibility checks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/events/buildfest/register");
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await settle(page);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.goto("/organizer");
  await page
    .getByRole("button", { name: "Create an event", exact: true })
    .click();
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await settle(page);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
