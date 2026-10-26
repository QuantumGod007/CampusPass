import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
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
test("REAL reporting: complete sanitized CSV, consistent attendance history, private post-event acknowledgement and browser PDF printing", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const f = await createLiveFixture({ capacity: 2, startsInMinutes: 10 }),
    contexts = [];
  try {
    const third = await registerTestAccount("Student Gamma", (x) =>
      f.accounts.push(x),
    );
    await f.pool.query(
      "select campuspass_private.provision_membership($1,$2,'student','active',null,'Browser reporting operator','Approved disposable reporting account')",
      [third.id, f.institution],
    );
    const e = f.event;
    const aBooking = ok(
      await f.studentA.client.rpc("book_campus_event", {
        p_event_id: e.id,
        p_request_id: randomUUID(),
      }),
    );
    const bBooking = ok(
      await f.studentB.client.rpc("book_campus_event", {
        p_event_id: e.id,
        p_request_id: randomUUID(),
      }),
    );
    ok(
      await third.client.rpc("join_campus_waitlist", {
        p_event_id: e.id,
        p_request_id: randomUUID(),
      }),
    );
    ok(
      await f.studentA.client.rpc("cancel_campus_booking", {
        p_booking_id: aBooking.id,
      }),
    );
    const promoted = ok(await third.client.rpc("list_my_campus_bookings")).find(
      (x) => x.event_id === e.id,
    );
    for (const [u, bk] of [
      [f.studentB, bBooking],
      [third, promoted],
    ]) {
      const pass = ok(
        await u.client.rpc("issue_campus_pass", { p_booking_id: bk.id }),
      );
      ok(
        await f.organizer.client.rpc("check_in_campus_pass", {
          p_event_id: e.id,
          p_token: pass.token,
        }),
      );
    }
    const title = "=SUM(1+1) Campus Event";
    ok(
      await f.organizer.client.rpc("save_campus_event", {
        p_event_id: e.id,
        p_expected_revision: e.revision,
        p_title: title,
        p_description: e.description,
        p_category: e.category,
        p_venue: e.venue,
        p_starts_at: e.starts_at,
        p_ends_at: e.ends_at,
        p_capacity: 2,
        p_theme: e.theme,
      }),
    );
    await f.pool.query(
      "insert into public.bookings(event_id,student_id,status,cancelled_at,cancellation_reason) select $1,$2,'cancelled',clock_timestamp(),'student' from generate_series(1,205)",
      [e.id, f.studentA.id],
    );
    const oc = await browser.newContext(),
      ac = await browser.newContext(),
      bc = await browser.newContext();
    contexts.push(oc, ac, bc);
    const org = await oc.newPage(),
      a = await ac.newPage(),
      b = await bc.newPage();
    await login(org, f.organizer, "/campus/organizer");
    await org
      .getByRole("link", { name: "View analytics", exact: true })
      .click();
    await expect(
      org.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    const kpi = (label: string) =>
      org
        .locator(".analytics-kpis > div")
        .filter({
          has: org.locator("dt").filter({ hasText: new RegExp(`^${label}$`) }),
        })
        .locator("dd");
    await expect(kpi("Current confirmed")).toHaveText("2");
    await expect(kpi("Historical cancellations")).toHaveText("206");
    await expect(kpi("Historical promotions")).toHaveText("1");
    await expect(kpi("All successful check-ins")).toHaveText("2");
    await expect(kpi("Check-in completion")).toHaveText("100%");
    await org
      .getByRole("button", { name: "Generate attendee report", exact: true })
      .click();
    await expect(
      org
        .getByRole("status")
        .filter({ hasText: "Report ready: 208 booking records" }),
    ).toBeVisible();
    await expect(org.locator(".analytics-report tbody tr")).toHaveCount(200);
    await org
      .getByRole("button", { name: "Next report page", exact: true })
      .click();
    await expect(org.locator(".analytics-report tbody tr")).toHaveCount(8);
    const downloading = org.waitForEvent("download");
    await org
      .getByRole("button", { name: "Download complete CSV", exact: true })
      .click();
    const download = await downloading;
    const path = await download.path();
    expect(path).toBeTruthy();
    const csv = await readFile(path!, "utf8");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.trimEnd().split("\r\n")).toHaveLength(209);
    expect(csv.includes('"\'=SUM(1+1) Campus Event"')).toBe(true);
    expect(csv).not.toContain(f.studentA.email);
    expect(csv).not.toContain("student_id");
    expect(download.suggestedFilename()).toBe(
      `campuspass-${e.id}-attendance.csv`,
    );
    await expect(
      org
        .getByRole("status")
        .filter({ hasText: "Complete CSV downloaded: 208 booking records" }),
    ).toBeVisible();
    for (const width of [320, 768, 1440]) {
      await org.setViewportSize({ width, height: 1000 });
      expect(
        await org.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    expect(
      (await new AxeBuilder({ page: org }).include("main").analyze())
        .violations,
    ).toEqual([]);
    await login(b, f.studentB, `/campus/organizer/${e.id}/analytics`);
    await expect(b.getByRole("alert")).toBeVisible();
    await expect(
      b.getByRole("button", { name: "Generate attendee report" }),
    ).toHaveCount(0);
    // Short real server-time event: issue/scan while entry is open, then wait for
    // its actual end; no production clock override or browser Auth injection.
    const starts = new Date(Date.now() + 6000),
      ends = new Date(starts.getTime() + 3000);
    const draft = ok(
      await f.organizer.client.rpc("create_campus_event", {
        p_title: "Recorded Participation Workshop",
        p_description:
          "An isolated short event used for genuine post-event participation eligibility and printing.",
        p_category: "Workshops",
        p_venue: "Participation Hall",
        p_starts_at: starts.toISOString(),
        p_ends_at: ends.toISOString(),
        p_capacity: 2,
        p_theme: "build",
      }),
    );
    const short = ok(
      await f.organizer.client.rpc("set_campus_event_status", {
        p_event_id: draft.id,
        p_expected_revision: draft.revision,
        p_status: "published",
      }),
    );
    const attended = ok(
      await f.studentA.client.rpc("book_campus_event", {
        p_event_id: short.id,
        p_request_id: randomUUID(),
      }),
    );
    await login(a, f.studentA, `/campus/bookings/${attended.id}`);
    await a
      .getByRole("button", { name: "Show entry pass", exact: true })
      .click();
    await a.getByText("Manual entry code", { exact: true }).click();
    const code = await a.locator(".admission-code").innerText();
    await org.goto(`/campus/organizer/${short.id}/check-in`);
    await org.getByLabel("Entry code", { exact: true }).fill(code);
    await org
      .getByRole("button", { name: "Validate and check in", exact: true })
      .click();
    await expect(org.locator(".admission-result")).toContainText(
      "Admitted — check-in recorded.",
    );
    await a
      .getByRole("link", { name: "Attendance & participation", exact: true })
      .click();
    await f.pool.query(
      "select pg_sleep(greatest(0,extract(epoch from $1::timestamptz-clock_timestamp()))+0.02)",
      [short.ends_at],
    );
    await a
      .getByRole("button", {
        name: "Refresh participation status",
        exact: true,
      })
      .click();
    await expect(a.locator(".campus-participation")).toContainText(
      "Student Alpha",
    );
    await expect(a.locator(".campus-participation")).toContainText(
      "Recorded Participation Workshop",
    );
    await expect(
      a.getByRole("button", {
        name: "Print / save participation record",
        exact: true,
      }),
    ).toBeVisible();
    const stored = (
      await f.pool.query(
        "select id,student_id,booking_id from public.participation_records where booking_id=$1",
        [attended.id],
      )
    ).rows;
    expect(stored).toHaveLength(1);
    expect(stored[0].student_id).toBe(f.studentA.id);
    await expect(a.locator(".campus-participation")).toContainText(
      stored[0].id,
    );
    expect(
      (await new AxeBuilder({ page: a }).include("main").analyze()).violations,
    ).toEqual([]);
    for (const width of [320, 768, 1440]) {
      await a.setViewportSize({ width, height: 1000 });
      expect(
        await a.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await a.emulateMedia({ media: "print" });
    await expect(a.locator(".site-header")).toBeHidden();
    await expect(a.locator(".participation-controls").first()).toBeHidden();
    await expect(a.locator(".campus-participation")).toBeVisible();
    const pdf = await a.pdf({ format: "A4" });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    await a.emulateMedia({ media: "screen" });
    // Independent sessions and same-browser switching both enforce own-only reads.
    await b.goto(`/campus/bookings/${attended.id}/participation`);
    await expect(b.getByRole("alert")).toBeVisible();
    await expect(b.locator(".campus-participation")).toHaveCount(0);
    await a.getByRole("button", { name: "Open account menu" }).click();
    await a.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(a).toHaveURL(/\/login\?next=/);
    await login(a, f.studentB, `/campus/bookings/${attended.id}/participation`);
    await expect(a.getByRole("alert")).toBeVisible();
    await expect(a.locator(".campus-participation")).toHaveCount(0);
    const fresh = await browser.newContext();
    contexts.push(fresh);
    const restored = await fresh.newPage();
    await login(
      restored,
      f.studentA,
      `/campus/bookings/${attended.id}/participation`,
    );
    await expect(restored.locator(".campus-participation")).toContainText(
      stored[0].id,
    );
  } finally {
    await Promise.all(contexts.map((x) => x.close()));
    await f.dispose();
  }
});
