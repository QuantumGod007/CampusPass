import { expect, test } from "@playwright/test";

test("the session provider leaves demo browsing and auth storage isolated", async ({
  page,
}) => {
  const authRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/auth/v1/")) authRequests.push(request.url());
  });
  await page.addInitScript(() => {
    localStorage.setItem("campuspass.auth.v1", "untouched-auth-fixture");
  });
  for (const path of [
    "/",
    "/saved",
    "/bookings",
    "/organizer",
    "/events/buildfest/register",
  ]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("button", { name: "Demo mode" })).toBeVisible();
    expect(
      await page.evaluate(() => localStorage.getItem("campuspass.auth.v1")),
    ).toBe("untouched-auth-fixture");
  }
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "demo has been reset" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("campuspass.auth.v1")),
  ).toBe("untouched-auth-fixture");
  expect(authRequests).toEqual([]);
});
