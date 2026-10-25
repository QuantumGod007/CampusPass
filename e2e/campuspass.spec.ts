import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { AppState } from "../src/types";
import { mkdirSync } from "node:fs";
const key = "campuspass.demo.v1";
async function readyForVisualCheck(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.locator("img").evaluateAll(async (images) => {
    await Promise.all(
      images.map(async (image) => {
        const img = image as HTMLImageElement;
        img.loading = "eager";
        await img.decode();
      }),
    );
  });
  if (await page.locator(".hero-copy").count()) {
    await expect(page.locator(".hero-copy")).toHaveCSS("opacity", "1");
    await expect(page.locator(".featured-card")).toHaveCSS("opacity", "1");
  }
  if (await page.locator(".dialog-content").count()) {
    await expect(page.locator(".dialog-content")).toHaveCSS("opacity", "1");
  }
  for (const element of await page
    .locator(".toast, .confirmation-icon")
    .all()) {
    await expect(element).toHaveCSS("opacity", "1");
  }
}
async function fillStudent(page: Page, prn = "002026123456") {
  await page.getByLabel("Full name", { exact: true }).fill("Aarya Deshmukh");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("aarya@example.com");
  await page.getByLabel("Mobile number", { exact: true }).fill("9876543210");
  await page.getByLabel("Student PRN", { exact: true }).fill(prn);
  await page
    .getByLabel("Department", { exact: true })
    .selectOption("Computer Science");
  await page
    .getByLabel("Academic year", { exact: true })
    .selectOption("Second year");
  await page.getByRole("checkbox").check();
}
async function book(page: Page, event = "buildfest", prn?: string) {
  await page.goto(`/events/${event}/register`);
  await fillStudent(page, prn);
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await expect(
    page.getByRole("heading", { name: "You’re on the list." }),
  ).toBeVisible();
}
async function data(page: Page): Promise<AppState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
}
async function fillEvent(page: Page, title = "Creative Coding Evening") {
  await page.getByLabel("Event title").fill(title);
  await page.getByLabel("Organizer name").fill("Creative Club");
  await page
    .getByLabel("The story behind it")
    .fill(
      "An open studio evening to explore creative coding with your fellow campus makers.",
    );
  const localDate = (offset: number) => {
    const d = new Date(Date.now() + offset);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  await page.getByLabel("Starts at").fill(localDate(86400000 * 5));
  await page.getByLabel("Ends at").fill(localDate(86400000 * 5 + 7200000));
  await page.getByLabel("Venue", { exact: true }).fill("Design Studio");
  await page.getByLabel("Capacity", { exact: true }).fill("50");
}
test("homepage, twelve original posters, and console health", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Make room forthe unexpected.",
  );
  await expect(page.getByTestId("event-card")).toHaveCount(12);
  await page.locator("footer").scrollIntoViewIfNeeded();
  await readyForVisualCheck(page);
  await expect
    .poll(() =>
      page
        .locator("img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  expect(errors).toEqual([]);
  const state = await data(page);
  for (const event of state.events) {
    await expect(
      page
        .getByTestId("event-card")
        .filter({
          has: page.getByRole("heading", { name: event.title, exact: true }),
        })
        .locator("img"),
    ).toHaveAttribute("src", `/posters/${event.theme}.svg`);
  }
});
test("live search, multi-category filtering, reset, date filters and sorting", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Search events", { exact: true }).fill("robotics");
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await expect(page.getByTestId("event-card")).toContainText("Robotics Arena");
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Technology", exact: true }).click();
  await expect(page.getByTestId("event-card")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.getByLabel("Filter by date").selectOption("week");
  await expect(page.getByTestId("event-card")).toHaveCount(6);
  await page.getByLabel("Sort events").selectOption("title");
  await expect(page.getByTestId("event-card").first()).toContainText(
    "AI Innovation Summit",
  );
  await page.getByLabel("Filter by date").selectOption("all");
  await page.getByLabel("Spots available").check();
  await expect(page.getByTestId("event-card")).toHaveCount(11);
  await page
    .getByLabel("Search events", { exact: true })
    .fill("a nonexistent event");
  await expect(
    page.getByRole("heading", { name: "A little too specific?" }),
  ).toBeVisible();
});
test("bookmarks synchronize and persist across refresh and saved events", async ({
  page,
}) => {
  await page.goto("/");
  const card = page
    .getByTestId("event-card")
    .filter({ hasText: "Design After Dark" });
  await card
    .getByRole("button", { name: "Save Design After Dark", exact: true })
    .click();
  await page.reload();
  await expect(
    card.getByRole("button", { name: "Unsave Design After Dark" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/saved");
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Unsave Design After Dark" }).click();
  await expect(
    page.getByRole("heading", { name: "Keep a little curiosity for later." }),
  ).toBeVisible();
  await page.reload();
  expect((await data(page)).bookmarks).toEqual([]);
});
test("empty and invalid registration fields show accessible errors and retain input", async ({
  page,
}) => {
  await page.goto("/events/buildfest/register");
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await expect(page.getByText("Please enter your full name.")).toBeVisible();
  await expect(page.getByLabel("Full name", { exact: true })).toBeFocused();
  await expect(page.getByText("Please select your department.")).toBeVisible();
  await expect(
    page.getByText("Please select your academic year."),
  ).toBeVisible();
  await expect(
    page.getByText("Please accept the demo registration terms."),
  ).toBeVisible();
  await page.getByLabel("Full name", { exact: true }).fill("Aarya Deshmukh");
  await page.getByLabel("Email address", { exact: true }).fill("bad-email");
  await page.getByLabel("Mobile number", { exact: true }).fill("12345");
  await page.getByLabel("Student PRN", { exact: true }).fill("00123");
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(
    page.getByText("Mobile number must contain 10 digits."),
  ).toBeVisible();
  await expect(
    page.getByText("PRN must contain exactly 12 digits."),
  ).toBeVisible();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Aarya Deshmukh",
  );
  await expect(
    page.getByLabel("Email address", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  expect((await data(page)).registrations).toHaveLength(0);
});
test("registration, pass, double-click protection, printing, persistence and duplicate prevention", async ({
  page,
}) => {
  await page.goto("/events/buildfest/register");
  await fillStudent(page);
  await page.getByRole("button", { name: "Confirm registration" }).dblclick();
  await expect(
    page.getByRole("heading", { name: "You’re on the list." }),
  ).toBeVisible();
  await expect(page.getByText("002026123456", { exact: true })).toBeVisible();
  expect((await data(page)).registrations).toHaveLength(1);
  const passUrl = page.url();
  await page.reload();
  await expect(page.getByText("Aarya Deshmukh", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.printed = "true";
    };
  });
  await page.getByRole("button", { name: "Print demo pass" }).click();
  await expect(page.locator("body")).toHaveAttribute("data-printed", "true");
  await page
    .getByRole("link", { name: "View my bookings", exact: true })
    .click();
  await expect(page.locator(".booking-row")).toHaveCount(1);
  await expect(page.locator(".booking-row")).toContainText(
    "BuildFest Hackathon",
  );
  await page.getByRole("link", { name: "View event pass" }).click();
  await expect(page).toHaveURL(passUrl);
  await page.goto("/events/buildfest/register");
  await fillStudent(page);
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await expect(
    page.getByText("You've already registered for this event."),
  ).toBeVisible();
  expect((await data(page)).registrations).toHaveLength(1);
});
test("cancellation confirms accessibly, releases one seat, persists and permits rebooking", async ({
  page,
}) => {
  await book(page);
  await page.goto("/events/buildfest");
  await expect(page.locator(".registration-card")).toContainText(
    "Only 11 spots left",
  );
  await page.goto("/bookings");
  await page
    .getByRole("button", { name: "Cancel registration", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Keep it" }).click();
  expect((await data(page)).registrations[0].status).toBe("confirmed");
  await page
    .getByRole("button", { name: "Cancel registration", exact: true })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel registration", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Registration cancelled" }),
  ).toContainText("Registration cancelled");
  await page.getByRole("button", { name: /^Cancelled/ }).click();
  await expect(page.locator(".booking-row")).toHaveCount(1);
  await page.reload();
  expect((await data(page)).registrations[0].status).toBe("cancelled");
  await page.goto("/events/buildfest");
  await expect(page.locator(".registration-card")).toContainText(
    "Only 12 spots left",
  );
  await book(page);
  expect((await data(page)).registrations).toHaveLength(2);
});
test("sold-out and past events cannot be registered for, including direct routes", async ({
  page,
}) => {
  await page.goto("/events/film-festival");
  await expect(
    page.getByRole("button", { name: "This event is fully booked" }),
  ).toBeDisabled();
  await page.goto("/events/film-festival/register");
  await expect(
    page.getByRole("heading", { name: "This one’s a full house." }),
  ).toBeVisible();
  await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key)!) as AppState;
    state.events[0].start = new Date(Date.now() - 86400000).toISOString();
    state.events[0].end = new Date(Date.now() - 3600000).toISOString();
    localStorage.setItem(key, JSON.stringify(state));
  }, key);
  await page.goto("/events/buildfest");
  await expect(
    page.getByRole("button", { name: "Registration closed" }),
  ).toBeDisabled();
  await page.goto("/events/buildfest/register");
  await expect(
    page.getByRole("heading", { name: "This event is in the books." }),
  ).toBeVisible();
  expect((await data(page)).registrations).toHaveLength(0);
});
test("missing records and malformed routes recover gracefully", async ({
  page,
}) => {
  for (const [route, title] of [
    ["/events/unknown", "This event wandered off."],
    ["/events/missing/register", "We couldn’t find that event."],
    ["/bookings/bad-reference", "This pass isn’t in your browser."],
    ["/not-a-page", "A little off the campus map."],
  ]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
});
test("organizer rejects empty values, invalid dates and invalid capacity", async ({
  page,
}) => {
  await page.goto("/organizer");
  await page
    .getByRole("button", { name: "Create an event", exact: true })
    .click();
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(
    page.getByText("Use at least 5 characters for the event title."),
  ).toBeVisible();
  await expect(
    page.getByText("Capacity must be a positive whole number."),
  ).toBeVisible();
  await fillEvent(page);
  await page.getByLabel("Starts at").fill("2020-01-01T10:00");
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(
    page.getByText("Choose a start date and time in the future."),
  ).toBeVisible();
  await fillEvent(page);
  await page.getByLabel("Ends at").fill("2020-01-01T10:00");
  await page.getByLabel("Capacity", { exact: true }).fill("-1");
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(
    page.getByText("End time must be after the start time."),
  ).toBeVisible();
  await expect(
    page.getByText("Capacity must be a positive whole number."),
  ).toBeVisible();
  expect((await data(page)).events).toHaveLength(12);
});
test("organizer creation, editing, attendee records and capacity constraints", async ({
  page,
}) => {
  await page.goto("/organizer");
  await page
    .getByRole("button", { name: "Create an event", exact: true })
    .click();
  await fillEvent(page);
  await page.getByRole("button", { name: "Create event", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator("table")).toContainText("Creative Coding Evening");
  const created = (await data(page)).events.find((e) => e.createdLocally)!;
  await page.goto("/");
  await page
    .getByLabel("Search events", { exact: true })
    .fill("Creative Coding Evening");
  await expect(page.getByTestId("event-card")).toHaveCount(1);
  await book(page, created.id);
  await book(page, created.id, "002026123457");
  await page.goto("/organizer");
  await page
    .getByRole("button", { name: "Edit Creative Coding Evening" })
    .click();
  await page.getByLabel("Capacity", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByText("Capacity cannot be lower than 2 confirmed reservations."),
  ).toBeVisible();
  await page.getByLabel("Capacity", { exact: true }).fill("2");
  await page.getByLabel("Event title").fill("Creative Coding Morning");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("table")).toContainText("Creative Coding Morning");
  await page.getByRole("button", { name: "2 confirmed" }).click();
  await expect(page.getByRole("dialog")).toContainText("Aarya Deshmukh");
  await expect(page.locator(".attendee-list li")).toHaveCount(2);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  expect((await data(page)).registrations).toHaveLength(2);
  await page.goto(`/events/${created.id}`);
  await expect(
    page.getByRole("button", { name: "This event is fully booked" }),
  ).toBeDisabled();
});
test("corrupt local data recovers with a notice and reset clears the whole demo", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate((key) => localStorage.setItem(key, "broken json"), key);
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("fresh set of events");
  await expect(page.getByTestId("event-card")).toHaveCount(12);
  await page
    .getByRole("button", { name: "Save Design After Dark", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reset demo data", exact: true })
    .click();
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  expect((await data(page)).bookmarks).toHaveLength(0);
});
test("copy event link gives useful feedback", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/events/buildfest");
  await page.getByRole("button", { name: "Copy event link" }).click();
  await expect(page.getByRole("status")).toContainText("Event link copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "/events/buildfest",
  );
});
for (const width of [1440, 1024, 768, 390, 320]) {
  test(`responsive pages have no document overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/",
      "/events/buildfest",
      "/events/buildfest/register",
      "/saved",
      "/bookings",
      "/organizer",
    ]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `${route} overflows at ${width}`,
      ).toBe(true);
    }
    await page
      .getByRole("button", { name: "Create an event", exact: true })
      .click();
    const box = await page.getByRole("dialog").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  });
}
test("mobile navigation works with keyboard focus and dialog dismissal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "My bookings", exact: true })
    .click();
  await expect(page).toHaveURL(/\/bookings$/);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeFocused();
});
test("key pages and organizer modal meet automated WCAG checks", async ({
  page,
}) => {
  for (const route of [
    "/",
    "/events/buildfest",
    "/events/buildfest/register",
    "/saved",
    "/bookings",
    "/organizer",
  ]) {
    await page.goto(route);
    await readyForVisualCheck(page);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations,
      `${route}: ${JSON.stringify(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))}`,
    ).toEqual([]);
  }
  await page
    .getByRole("button", { name: "Create an event", exact: true })
    .click();
  await readyForVisualCheck(page);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await book(page);
  await readyForVisualCheck(page);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.goto("/bookings");
  await page
    .getByRole("button", { name: "Cancel registration", exact: true })
    .click();
  await readyForVisualCheck(page);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
test("capture desktop, mobile, form and event pass for visual review", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE_SCREENSHOTS !== "true",
    "Screenshot capture is opt-in.",
  );
  mkdirSync("docs/screenshots", { recursive: true });
  await page.goto("/");
  await readyForVisualCheck(page);
  if (process.env.CAPTURE_SCREENSHOTS === "true")
    await page.screenshot({
      path: "docs/screenshots/discover-desktop.png",
      fullPage: true,
    });
  await page.setViewportSize({ width: 390, height: 844 });
  if (process.env.CAPTURE_SCREENSHOTS === "true")
    await page.screenshot({
      path: "docs/screenshots/discover-mobile.png",
      fullPage: true,
    });
  await page.goto("/events/buildfest/register");
  await readyForVisualCheck(page);
  if (process.env.CAPTURE_SCREENSHOTS === "true")
    await page.screenshot({
      path: "docs/screenshots/registration-mobile.png",
      fullPage: true,
    });
  await page.setViewportSize({ width: 1440, height: 1000 });
  if (process.env.CAPTURE_SCREENSHOTS === "true")
    await page.screenshot({
      path: "docs/screenshots/registration-desktop.png",
      fullPage: true,
    });
  await book(page);
  await readyForVisualCheck(page);
  if (process.env.CAPTURE_SCREENSHOTS === "true")
    await page.screenshot({
      path: "docs/screenshots/demo-pass.png",
      fullPage: true,
    });
});
