import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import {
  createLiveFixture,
  registerTestAccount,
  ok,
} from "../scripts/database/live-fixture.mjs";
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
test("REAL waitlist → cancellation → FIFO promotion → notification → persisted booking → secure QR check-in across independent accounts", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const f = await createLiveFixture({ capacity: 1, startsInMinutes: 10 }),
    contexts = [];
  try {
    const c = await registerTestAccount("Student Gamma", (x) =>
      f.accounts.push(x),
    );
    await f.pool.query(
      "select campuspass_private.provision_membership($1,$2,'student','active',null,'Browser operator','Approved disposable third waitlist account')",
      [c.id, f.institution],
    );
    const ac = await browser.newContext(),
      bc = await browser.newContext(),
      cc = await browser.newContext(),
      oc = await browser.newContext();
    contexts.push(ac, bc, cc, oc);
    const a = await ac.newPage(),
      b = await bc.newPage(),
      third = await cc.newPage(),
      org = await oc.newPage();
    const original = ok(
      await f.studentA.client.rpc("book_campus_event", {
        p_event_id: f.event.id,
        p_request_id: randomUUID(),
      }),
    );
    const eventPath = `/campus/events/${f.event.id}`;
    await login(b, f.studentB, eventPath);
    await expect(
      b.getByRole("button", { name: "Join waitlist", exact: true }),
    ).toBeDisabled();
    await b.getByRole("checkbox", { name: /I agree that a free seat/ }).check();
    await b.getByRole("button", { name: "Join waitlist", exact: true }).click();
    await expect(
      b
        .getByRole("status")
        .filter({ hasText: "You are waiting · Position 1 of 1" }),
    ).toBeVisible();
    await expect(
      b.getByRole("img", { name: "Temporary event entry QR code" }),
    ).toHaveCount(0);
    await login(third, c, eventPath);
    await third
      .getByRole("checkbox", { name: /I agree that a free seat/ })
      .check();
    await third
      .getByRole("button", { name: "Join waitlist", exact: true })
      .click();
    await expect(
      third
        .getByRole("status")
        .filter({ hasText: "You are waiting · Position 2 of 2" }),
    ).toBeVisible();
    await login(a, f.studentA, `/campus/bookings/${original.id}`);
    await a
      .getByRole("button", { name: "Cancel registration", exact: true })
      .click();
    await a
      .getByRole("button", { name: "Confirm cancellation", exact: true })
      .click();
    await expect(a.locator(".status-label")).toHaveText("CANCELLED");
    await b.reload();
    await expect(
      b.getByRole("link", { name: "View your registration", exact: true }),
    ).toBeVisible();
    await third
      .getByRole("button", { name: "Refresh waitlist", exact: true })
      .click();
    await expect(
      third
        .getByRole("status")
        .filter({ hasText: "You are waiting · Position 1 of 1" }),
    ).toBeVisible();
    await b.getByRole("link", { name: /Notifications, \d+ unread/ }).click();
    await expect(
      b.getByRole("heading", {
        name: "Your registration is confirmed",
        exact: true,
      }),
    ).toBeVisible();
    const notice = b
      .getByRole("listitem")
      .filter({
        has: b.getByRole("heading", {
          name: "Your registration is confirmed",
          exact: true,
        }),
      });
    await notice.getByRole("button", { name: /Mark as read/ }).click();
    await expect(notice.getByText("READ", { exact: true })).toBeVisible();
    await expect(
      b.getByRole("status").filter({ hasText: "1 unread notifications" }),
    ).toBeVisible();
    await notice
      .getByRole("link", { name: "Open booking", exact: true })
      .click();
    await expect(b.locator(".status-label")).toHaveText("CONFIRMED");
    const promotedId = new URL(b.url()).pathname.split("/").at(-1)!;
    expect(promotedId).not.toBe(original.id);
    await b
      .getByRole("button", { name: "Show entry pass", exact: true })
      .click();
    await expect(
      b.getByRole("img", { name: "Temporary event entry QR code" }),
    ).toBeVisible();
    await b.getByText("Manual entry code", { exact: true }).click();
    const token = await b.locator(".admission-code").innerText();
    await login(org, f.organizer, "/campus/organizer");
    await expect(
      org.getByText("1 waiting · 0 available", { exact: true }),
    ).toBeVisible();
    await org.getByRole("link", { name: "Check in", exact: true }).click();
    await org.getByLabel("Entry code", { exact: true }).fill(token);
    await org
      .getByRole("button", { name: "Validate and check in", exact: true })
      .click();
    await expect(org.locator(".admission-result")).toContainText(
      "Admitted — check-in recorded.",
    );
    await b.reload();
    await expect(b.getByText("Checked in", { exact: true })).toBeVisible();
    const state = (
      await f.pool.query(
        "select w.status,w.booking_id,b.status booking_status from public.event_waitlist w join public.bookings b on b.id=w.booking_id where w.event_id=$1 and w.student_id=$2",
        [f.event.id, f.studentB.id],
      )
    ).rows;
    expect(state).toHaveLength(1);
    expect(state[0].booking_id).toBe(promotedId);
    expect(state[0].booking_status).toBe("confirmed");
    expect(
      (
        await f.pool.query(
          "select count(*)::int n from public.event_checkins where booking_id=$1",
          [promotedId],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await f.pool.query(
          "select count(*)::int n from public.campus_notifications where event_id=$1 and recipient_id=$2 and kind='waitlist_promoted'",
          [f.event.id, f.studentB.id],
        )
      ).rows[0].n,
    ).toBe(1);
    await third.goto("/campus/notifications");
    await expect(
      third.getByRole("heading", {
        name: "Your registration is confirmed",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      third.getByRole("heading", {
        name: "You joined the waitlist",
        exact: true,
      }),
    ).toBeVisible();
    for (const page of [b, third, org])
      for (const width of [320, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    expect(
      (await new AxeBuilder({ page: third }).include("main").analyze())
        .violations,
    ).toEqual([]);
    // Same-browser switch cannot restore the previous private inbox or booking.
    await b.getByRole("button", { name: "Open account menu" }).click();
    await b.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(b).toHaveURL(/\/login\?next=/);
    await login(b, c, "/campus/notifications");
    await expect(
      b.getByRole("heading", {
        name: "Your registration is confirmed",
        exact: true,
      }),
    ).toHaveCount(0);
    await b.goto(`/campus/bookings/${promotedId}`);
    await expect(
      b.getByRole("heading", { name: "This booking isn’t available." }),
    ).toBeVisible();
    const fresh = await browser.newContext();
    contexts.push(fresh);
    const restored = await fresh.newPage();
    await login(restored, f.studentB, `/campus/bookings/${promotedId}`);
    await expect(
      restored.getByText("Checked in", { exact: true }),
    ).toBeVisible();
  } finally {
    await Promise.all(contexts.map((x) => x.close()));
    await f.dispose();
  }
});
