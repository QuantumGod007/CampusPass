import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { createLiveFixture } from "../scripts/database/live-fixture.mjs";
async function login(
  page: Page,
  account: { email: string; password: string },
  path: string,
) {
  await page.goto(`/login?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Email address", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(`http://127.0.0.1:4175${path}`);
}
async function fits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test("REAL multi-user events: organizer publishes, two students book, refresh/login persist, cancellation frees a seat and attendees stay private", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const fixture = await createLiveFixture({ sampleEvent: false });
  const contexts = [];
  try {
    const orgContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "Asia/Kolkata",
    });
    contexts.push(orgContext);
    const aContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "Asia/Kolkata",
    });
    contexts.push(aContext);
    const bContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "Asia/Kolkata",
    });
    contexts.push(bContext);
    const org = await orgContext.newPage(),
      a = await aContext.newPage(),
      b = await bContext.newPage();
    await login(org, fixture.organizer, "/campus/organizer");
    await org
      .getByRole("button", { name: "Create institution event", exact: true })
      .click();
    await org
      .getByRole("button", { name: "Save draft event", exact: true })
      .click();
    await expect(org.getByLabel("Event title", { exact: true })).toBeFocused();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await org.setViewportSize({ width, height: 1000 });
      await fits(org);
      expect(
        (
          await new AxeBuilder({ page: org })
            .include('[role="dialog"]')
            .analyze()
        ).violations,
      ).toEqual([]);
    }
    const title = `Multi-user Workshop ${randomUUID().slice(0, 8)}`;
    await org.getByLabel("Event title", { exact: true }).fill(title);
    await org
      .getByLabel("Event description", { exact: true })
      .fill(
        "A real shared workshop created through the organizer interface for multi-user booking verification.",
      );
    await org
      .getByLabel("Venue", { exact: true })
      .fill("Shared Institute Hall");
    const start = new Date(Date.now() + 172800000).toISOString().slice(0, 16),
      end = new Date(Date.now() + 180000000).toISOString().slice(0, 16);
    await org.getByLabel("Starts at", { exact: true }).fill(start);
    await org.getByLabel("Ends at", { exact: true }).fill(end);
    await org.getByLabel("Capacity", { exact: true }).fill("2");
    await org
      .getByRole("button", { name: "Save draft event", exact: true })
      .click();
    await expect(org.getByRole("dialog")).toBeHidden();
    const row = org.getByRole("row").filter({ hasText: title });
    await expect(row).toContainText("draft");
    await row
      .getByRole("button", { name: "Publish event", exact: true })
      .click();
    await expect(row).toContainText("published");
    const stored = (
      await fixture.pool.query(
        "select * from public.events where organizer_id=$1 and title=$2",
        [fixture.organizer.id, title],
      )
    ).rows[0];
    expect(stored.institution_id).toBe(fixture.institution);
    expect(stored.status).toBe("published");
    expect(stored.capacity).toBe(2);
    expect(new Date(stored.starts_at).toISOString()).toBe(
      new Date(`${start}:00+05:30`).toISOString(),
    );
    const path = `/campus/events/${stored.id}`;
    await login(a, fixture.studentA, "/campus");
    await a.getByRole("link", { name: title, exact: true }).click();
    await expect(a).toHaveURL(`http://127.0.0.1:4175${path}`);
    await expect(
      a.getByText("2 seats available", { exact: true }),
    ).toBeVisible();
    const demo = await a.evaluate(() =>
      JSON.parse(localStorage.getItem("campuspass.demo.v1") || "null"),
    );
    await a
      .getByRole("button", { name: "Confirm registration", exact: true })
      .click();
    await expect(a).toHaveURL(/\/campus\/bookings\/[0-9a-f-]{36}$/);
    await expect(a.locator(".status-label")).toHaveText("CONFIRMED");
    const aReference = await a.locator(".campus-reference code").innerText();
    const aBookingPath = new URL(a.url()).pathname;
    await login(b, fixture.studentB, path);
    await expect(
      b.getByText("1 seat available", { exact: true }),
    ).toBeVisible();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await b.setViewportSize({ width, height: 1000 });
      await fits(b);
    }
    await b
      .getByRole("button", { name: "Confirm registration", exact: true })
      .click();
    await expect(b.locator(".status-label")).toHaveText("CONFIRMED");
    for (const width of [320, 390, 768, 1024, 1440]) {
      await b.setViewportSize({ width, height: 1000 });
      await fits(b);
    }
    await a.reload();
    await expect(a.locator(".campus-reference code")).toHaveText(aReference);
    await a.getByRole("button", { name: "Open account menu" }).click();
    await a.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(a).toHaveURL(/\/login\?next=/);
    await login(a, fixture.studentA, aBookingPath);
    await expect(a.locator(".campus-reference code")).toHaveText(aReference);
    await a
      .getByRole("button", { name: "Cancel registration", exact: true })
      .click();
    await a
      .getByRole("button", { name: "Confirm cancellation", exact: true })
      .click();
    await expect(a.locator(".status-label")).toHaveText("CANCELLED");
    expect(
      await a.evaluate(() =>
        JSON.parse(localStorage.getItem("campuspass.demo.v1") || "null"),
      ),
    ).toEqual(demo);
    await b.goto(path);
    await expect(
      b.getByText("1 seat available", { exact: true }),
    ).toBeVisible();
    await org
      .getByRole("button", { name: "Refresh studio", exact: true })
      .click();
    await row
      .getByRole("button", { name: "1 confirmed / 2", exact: true })
      .click();
    const attendeeDialog = org.getByRole("dialog");
    await expect(attendeeDialog).toContainText("Student Alpha");
    await expect(attendeeDialog).toContainText("Student Beta");
    await expect(attendeeDialog).toContainText("1 cancelled");
    await expect(attendeeDialog).not.toContainText(fixture.studentA.email);
    for (const width of [320, 390, 768, 1024, 1440]) {
      await org.setViewportSize({ width, height: 1000 });
      await fits(org);
    }
    await org
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await org.setViewportSize({ width, height: 1000 });
      await fits(org);
    }
    const rows = (
      await fixture.pool.query(
        "select student_id,status,reference from public.bookings where event_id=$1",
        [stored.id],
      )
    ).rows;
    expect(rows).toHaveLength(2);
    expect(rows.filter((item) => item.status === "confirmed")).toHaveLength(1);
    expect(rows.filter((item) => item.status === "cancelled")).toHaveLength(1);
    await b.goto(aBookingPath);
    await expect(
      b.getByRole("heading", { name: "This booking isn’t available." }),
    ).toBeVisible();
    await expect(b.locator("main")).not.toContainText(aReference);
    await b.goto("/campus/organizer");
    await expect(
      b.getByRole("heading", {
        name: "Organizer access hasn’t been provisioned.",
      }),
    ).toBeVisible();
    await expect(
      b.getByRole("button", { name: "Create institution event" }),
    ).toHaveCount(0);
    const fresh = await browser.newContext();
    contexts.push(fresh);
    const freshPage = await fresh.newPage();
    await login(freshPage, fixture.studentA, aBookingPath);
    await expect(freshPage.locator(".campus-reference code")).toHaveText(
      aReference,
    );
    await expect(freshPage.locator(".status-label")).toHaveText("CANCELLED");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await fixture.dispose();
  }
});
