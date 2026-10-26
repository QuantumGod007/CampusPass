import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash, randomUUID } from "node:crypto";
import { createLiveFixture, ok } from "../scripts/database/live-fixture.mjs";
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
test("REAL secure admission: temporary QR → independent organizer check-in → database record → reload, retry, second student and account isolation", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const f = await createLiveFixture({ startsInMinutes: 10 }),
    contexts = [];
  try {
    const ac = await browser.newContext(),
      oc = await browser.newContext(),
      bc = await browser.newContext();
    contexts.push(ac, oc, bc);
    const a = await ac.newPage(),
      org = await oc.newPage(),
      b = await bc.newPage();
    const ab = ok(
      await f.studentA.client.rpc("book_campus_event", {
        p_event_id: f.event.id,
        p_request_id: randomUUID(),
      }),
    );
    const bb = ok(
      await f.studentB.client.rpc("book_campus_event", {
        p_event_id: f.event.id,
        p_request_id: randomUUID(),
      }),
    );
    await login(a, f.studentA, `/campus/bookings/${ab.id}`);
    await a
      .getByRole("button", { name: "Show entry pass", exact: true })
      .click();
    await expect(
      a.getByRole("img", { name: "Temporary event entry QR code" }),
    ).toBeVisible();
    await expect(a.getByRole("timer")).toContainText(/Expires in \d+ seconds/);
    await a.getByText("Manual entry code", { exact: true }).click();
    const token = await a.locator(".admission-code").innerText();
    expect(/^cp1_[0-9a-f]{64}$/.test(token)).toBe(true);
    const stored = (
      await f.pool.query(
        "select token_hash from public.admission_tokens where booking_id=$1",
        [ab.id],
      )
    ).rows[0];
    expect(
      stored.token_hash.equals(createHash("sha256").update(token).digest()),
    ).toBe(true);
    expect(
      await a.evaluate(
        (value) =>
          Object.values(localStorage).some((x) => String(x).includes(value)),
        token,
      ),
    ).toBe(false);
    await login(org, f.organizer, "/campus/organizer");
    await org.getByRole("link", { name: "Check in", exact: true }).click();
    await expect(
      org.getByRole("heading", { name: "Event check-in." }),
    ).toBeVisible();
    await expect(org.getByText("0 admitted", { exact: true })).toBeVisible();
    await org.getByLabel("Entry code", { exact: true }).fill(ab.reference);
    await org
      .getByRole("button", { name: "Validate and check in", exact: true })
      .click();
    await expect(org.getByText(/Invalid pass for this event/)).toBeVisible();
    await org.getByLabel("Entry code", { exact: true }).fill(token);
    await org
      .getByRole("button", { name: "Validate and check in", exact: true })
      .click();
    await expect(
      org
        .getByRole("status")
        .filter({ hasText: "Admitted — check-in recorded." }),
    ).toBeVisible();
    await expect(org.locator(".admission-result")).toBeFocused();
    await expect(org.getByText("1 admitted", { exact: true })).toBeVisible();
    expect(
      await org.getByLabel("Entry code", { exact: true }).inputValue(),
    ).toBe("");
    const records = (
      await f.pool.query(
        "select * from public.event_checkins where booking_id=$1",
        [ab.id],
      )
    ).rows;
    expect(records).toHaveLength(1);
    expect(records[0].organizer_id).toBe(f.organizer.id);
    expect(records[0].event_id).toBe(f.event.id);
    await a
      .getByRole("button", { name: "Refresh admission status", exact: true })
      .click();
    await expect(a.getByText("Checked in", { exact: true })).toBeVisible();
    await a.reload();
    await expect(a.getByText("Checked in", { exact: true })).toBeVisible();
    await expect(
      a.getByRole("img", { name: "Temporary event entry QR code" }),
    ).toHaveCount(0);
    await org.getByLabel("Entry code", { exact: true }).fill(token);
    await org
      .getByRole("button", { name: "Validate and check in", exact: true })
      .click();
    await expect(org.locator(".admission-result")).toContainText(
      "Already checked in — do not admit again.",
    );
    await login(b, f.studentB, `/campus/bookings/${bb.id}`);
    await b
      .getByRole("button", { name: "Show entry pass", exact: true })
      .click();
    await expect(
      b.getByRole("img", { name: "Temporary event entry QR code" }),
    ).toBeVisible();
    await b.getByText("Manual entry code", { exact: true }).click();
    const secondToken = await b.locator(".admission-code").innerText();
    expect(secondToken !== token).toBe(true);
    await org.getByLabel("Entry code", { exact: true }).fill(secondToken);
    await org
      .getByRole("button", { name: "Validate and check in", exact: true })
      .click();
    await expect(org.locator(".admission-result")).toContainText(
      "Admitted — check-in recorded.",
    );
    await expect(org.getByText("2 admitted", { exact: true })).toBeVisible();
    expect(
      (
        await f.pool.query(
          "select count(*)::int n from public.event_checkins where event_id=$1",
          [f.event.id],
        )
      ).rows[0].n,
    ).toBe(2);
    expect(
      (
        await f.pool.query(
          "select count(*)::int n from public.bookings where event_id=$1",
          [f.event.id],
        )
      ).rows[0].n,
    ).toBe(2);
    await expect(org.locator("main")).not.toContainText(f.studentA.email);
    for (const page of [a, org, b])
      for (const width of [320, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    expect(
      (await new AxeBuilder({ page: org }).include("main").analyze())
        .violations,
    ).toEqual([]);
    // Same browser switches A to B; it cannot retain or recover A's pass.
    await a.getByRole("button", { name: "Open account menu" }).click();
    await a.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(a).toHaveURL(/\/login\?next=/);
    await login(a, f.studentB, `/campus/bookings/${ab.id}`);
    await expect(
      a.getByRole("heading", { name: "This booking isn’t available." }),
    ).toBeVisible();
    await expect(a.locator("main")).not.toContainText(ab.reference);
    await expect(a.locator(".admission-code")).toHaveCount(0);
    await a.goto(`/campus/organizer/${f.event.id}/check-in`);
    await expect(a.getByRole("alert")).toBeVisible();
    await expect(a.getByLabel("Entry code", { exact: true })).toHaveCount(0);
    // New sign-in also restores PostgreSQL admission state.
    await b.reload();
    await expect(b.getByText("Checked in", { exact: true })).toBeVisible();
    const history = (
      await f.pool.query(
        "select actor_user_id,details from public.audit_log where subject_id=$1 and action='admission_scan' and details->>'outcome'='admitted'",
        [f.event.id],
      )
    ).rows;
    expect(history).toHaveLength(2);
    expect(history.every((row) => row.actor_user_id === f.organizer.id)).toBe(
      true,
    );
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    await f.dispose();
  }
});
