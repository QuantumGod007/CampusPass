import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { authSession } from "../src/tests/auth-fixtures";
import { profileAccount } from "../src/tests/profile-fixtures";
test.use({ baseURL: "http://127.0.0.1:4174" });
// Deliberately mocked HTTP. Security and persistence are verified separately
// against real PostgreSQL and the isolated Supabase Auth/PostgREST CI stack.
async function fixture(page: Page) {
  const session = authSession();
  let account = profileAccount();
  let saves = 0;
  await page.route(
    "https://campuspass-auth-fixture.example.test/**",
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      };
      if (request.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      let data: unknown;
      if (path.endsWith("/token")) data = session;
      else if (path.endsWith("/user")) data = session.user;
      else if (path.endsWith("/rpc/get_student_account")) data = account;
      else if (path.endsWith("/rpc/save_student_profile")) {
        saves++;
        const body = request.postDataJSON();
        expect(Object.keys(body).sort()).toEqual([
          "p_academic_year",
          "p_department",
          "p_display_name",
          "p_prn",
        ]);
        account = {
          ...profileAccount(undefined, true),
          profile: {
            ...profileAccount(undefined, true).profile!,
            display_name: body.p_display_name,
            prn: body.p_prn,
            department: body.p_department,
            academic_year: body.p_academic_year,
          },
        };
        data = account;
      } else if (path.endsWith("/logout"))
        return route.fulfill({ status: 204, headers });
      else
        return route.fulfill({
          status: 400,
          headers,
          json: { message: "Unknown fixture request" },
        });
      await route.fulfill({ status: 200, headers, json: data });
    },
  );
  await page.goto("/login?next=%2Faccount%2Fprofile");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("student@example.test");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/account\/profile$/);
  await expect(page.getByText("Setup needed", { exact: true })).toBeVisible();
  return { count: () => saves };
}
async function fillProfile(page: Page) {
  await page.getByLabel("Display name", { exact: true }).fill("Aarya Student");
  await page.getByLabel("Student PRN", { exact: true }).fill("002026123456");
  await page
    .getByLabel("Department", { exact: true })
    .selectOption("Computer Science");
  await page
    .getByLabel("Academic year", { exact: true })
    .selectOption("Second year");
}
for (const width of [320, 390, 768, 1024, 1440]) {
  test(`profile setup and overview at ${width}px: accessible, no overflow, screenshots`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page);
    await expect(
      page.getByText("Enrollment unverified", { exact: true }),
    ).toBeVisible();
    await mkdir("test-results/profile-screenshots", { recursive: true });
    await page.screenshot({
      path: `test-results/profile-screenshots/setup-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).include("main").analyze()).violations,
    ).toEqual([]);
    await fillProfile(page);
    await page.getByRole("button", { name: "Create student profile" }).click();
    await expect(
      page.getByText("Profile complete", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "A little more you." }),
    ).toBeFocused();
    // Capture from the document origin: full-page Chromium captures can expose
    // off-viewport fixed elements when focus has scrolled the page after save.
    await page.getByRole("button", { name: "Dismiss notification" }).click();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: `test-results/profile-screenshots/overview-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).include("main").analyze()).violations,
    ).toEqual([]);
  });
}
test("profile validation, edit, repeated submit and demo separation with mocked HTTP", async ({
  page,
}) => {
  const control = await fixture(page);
  const demo = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("campuspass.demo.v1") || "null"),
  );
  await page.getByRole("button", { name: "Create student profile" }).click();
  await expect(page.getByLabel("Display name", { exact: true })).toBeFocused();
  await expect(
    page.getByText("PRN must contain exactly 12 digits."),
  ).toBeVisible();
  expect(control.count()).toBe(0);
  await fillProfile(page);
  await page.getByRole("button", { name: "Create student profile" }).dblclick();
  await expect(
    page.getByText("Profile complete", { exact: true }),
  ).toBeVisible();
  expect(control.count()).toBe(1);
  await page.getByRole("button", { name: "Edit profile" }).click();
  await page.getByLabel("Display name", { exact: true }).fill("Aarya Updated");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Aarya Updated", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Aarya Updated", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("campuspass.demo.v1") || "null"),
    ),
  ).toEqual(demo);
  expect(
    await page.evaluate(() => localStorage.getItem("campuspass.auth.v1")),
  ).not.toContain("Aarya");
});
test("unconfigured profile route keeps the demo available", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:4173/account/profile");
  await expect(
    page.getByText("Keep exploring.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Explore the demo" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:4173/");
});
