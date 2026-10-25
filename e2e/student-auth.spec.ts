import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { authSession } from "../src/tests/auth-fixtures";

test.use({ baseURL: "http://127.0.0.1:4174" });

async function mockAuth(page: Page, signupSession = false) {
  const requests: { path: string; body: Record<string, unknown> | null }[] = [];
  const session = authSession();
  await page.route(
    "https://campuspass-auth-fixture.example.test/**",
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      };
      if (request.method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      const body = request.postData() ? request.postDataJSON() : null;
      requests.push({ path: url.pathname + url.search, body });
      let data: unknown;
      let status = 200;
      if (url.pathname.endsWith("/signup"))
        data = signupSession ? session : session.user;
      else if (url.pathname.endsWith("/token")) {
        if (body?.password === "wrong-password") {
          status = 400;
          data = {
            error_code: "invalid_credentials",
            msg: "private-provider-details",
          };
        } else data = session;
      } else if (url.pathname.endsWith("/user")) data = session.user;
      else if (url.pathname.endsWith("/rpc/get_student_account"))
        data = { user_id: session.user.id, profile: null, membership: null };
      else if (url.pathname.endsWith("/logout"))
        return route.fulfill({ status: 204, headers });
      else {
        status = 400;
        data = { msg: "Unexpected fixture request" };
      }
      await route.fulfill({ status, headers, json: data });
    },
  );
  return requests;
}

async function credentials(
  page: Page,
  signup = false,
  password = "password123",
) {
  await page
    .getByLabel("Email address", { exact: true })
    .fill("student@example.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  if (signup)
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
}

test("SDK login, safe return, refresh persistence and logout preserve demo records", async ({
  page,
}) => {
  const requests = await mockAuth(page);
  await page.goto("/login?next=%2Fsaved");
  await expect(page.getByLabel("Email address")).toBeVisible();
  const demo = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("campuspass.demo.v1") || "null"),
  );
  await credentials(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:4174/saved");
  await expect(
    page.getByRole("button", { name: "Open account menu" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open account menu" }).click();
  await expect(page.getByRole("dialog")).toContainText("student@example.test");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(() => localStorage.getItem("campuspass.auth.v1")),
  ).toBeNull();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("campuspass.demo.v1") || "null"),
    ),
  ).toEqual(demo);
  expect(
    requests.some((request) => request.path.includes("logout?scope=local")),
  ).toBe(true);
});

test("SDK invalid credentials become friendly errors and permit another attempt", async ({
  page,
}) => {
  await mockAuth(page);
  await page.goto("/login");
  await credentials(page, false, "wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "email or password is incorrect",
  );
  await expect(page.getByRole("alert")).not.toContainText(
    "private-provider-details",
  );
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:4174/");
});

test("signup waits for confirmation and the SDK completes a same-browser PKCE callback", async ({
  page,
}) => {
  const requests = await mockAuth(page);
  await page.goto("/signup");
  await credentials(page, true);
  await page.getByRole("button", { name: "Create student account" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your inbox." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open account menu" }),
  ).toHaveCount(0);
  expect(
    requests.find((request) => request.path.includes("/signup"))?.body,
  ).not.toHaveProperty("data.role");
  await page.goto("/auth/callback?code=synthetic-confirmation-code");
  await expect(page).toHaveURL("http://127.0.0.1:4174/");
  await expect(
    page.getByRole("button", { name: "Open account menu" }),
  ).toBeVisible();
  expect(
    requests.some((request) => request.path.includes("grant_type=pkce")),
  ).toBe(true);
});

test("signup supports projects where confirmation is disabled without fabricating an email step", async ({
  page,
}) => {
  await mockAuth(page, true);
  await page.goto("/signup?next=%2Fsaved");
  await credentials(page, true);
  await page.getByRole("button", { name: "Create student account" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:4174/saved");
  await expect(
    page.getByRole("button", { name: "Open account menu" }),
  ).toBeVisible();
});

test("untrusted return URLs and failed confirmation details never escape into navigation or copy", async ({
  page,
}) => {
  await mockAuth(page);
  await page.goto(
    "/auth/callback#error=access_denied&error_description=private-provider-token",
  );
  await expect(page.getByRole("alert")).toContainText("expired");
  await expect(page.getByRole("alert")).not.toContainText(
    "private-provider-token",
  );
  await expect(page).toHaveURL("http://127.0.0.1:4174/auth/callback");
  await page.goto("/login?next=%2F%2Fevil.example");
  await credentials(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:4174/");
});

test("mobile navigation provides accessible sign-in and logout without changing demo access", async ({
  page,
}) => {
  await mockAuth(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Sign in", exact: true })
    .click();
  await credentials(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:4174/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog")).toContainText("student@example.test");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("event-card")).toHaveCount(12);
});

for (const width of [320, 390, 768, 1440]) {
  test(`auth forms fit, validate, and pass accessibility checks at ${width}px`, async ({
    page,
  }, testInfo) => {
    await mockAuth(page);
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ["/login", "/signup"]) {
      await page.goto(path);
      const button = page.getByRole("button", {
        name: path === "/login" ? "Sign in" : "Create student account",
        exact: true,
      });
      await button.click();
      await expect(page.getByLabel("Email address")).toBeFocused();
      await expect(page.getByText("Enter your email address.")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    }
    if (width === 1440 || width === 390) {
      await page.goto("/login");
      await expect(page.getByLabel("Email address")).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`campuspass-login-${width}.png`),
        fullPage: true,
      });
    }
  });
}
