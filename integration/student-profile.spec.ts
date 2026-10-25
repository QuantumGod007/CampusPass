import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  apiClient,
  confirmationLink,
  databasePool,
} from "../scripts/database/test-environment.mjs";
async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login?next=%2Faccount%2Fprofile");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/account\/profile$/);
}
test("REAL Supabase: confirmed signup, database save, refresh, logout, fresh login and separate browser restoration", async ({
  page,
  browser,
}) => {
  const email = `phase5-browser-${randomUUID()}@example.test`;
  const password = `Test-${randomUUID()}-9a!`;
  const pool = databasePool();
  const api = apiClient();
  let userId: string | undefined;
  let otherEmail: string | undefined;
  const contexts = [];
  try {
    await page.goto("/signup");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create student account" }).click();
    await expect(
      page.getByRole("heading", { name: "Check your inbox." }),
    ).toBeVisible();
    const result = await pool.query(
      "select id from auth.users where email=$1",
      [email],
    );
    userId = result.rows[0]?.id;
    expect(userId).toBeTruthy();
    await page.goto(await confirmationLink(email));
    await expect(
      page.getByRole("button", { name: "Open account menu" }),
    ).toBeVisible();
    await page.goto("/account/profile");
    await expect(page.getByText("Setup needed", { exact: true })).toBeVisible();
    const demo = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("campuspass.demo.v1") || "null"),
    );
    await page
      .getByLabel("Display name", { exact: true })
      .fill("Browser Student");
    await page.getByLabel("Student PRN", { exact: true }).fill("001234567891");
    await page
      .getByLabel("Department", { exact: true })
      .selectOption("Computer Science");
    await page
      .getByLabel("Academic year", { exact: true })
      .selectOption("Second year");
    await page.getByRole("button", { name: "Create student profile" }).click();
    await expect(
      page.getByText("Profile complete", { exact: true }),
    ).toBeVisible();
    expect(
      (
        await pool.query(
          "select prn from public.student_profiles where user_id=$1",
          [userId],
        )
      ).rows[0].prn,
    ).toBe("001234567891");
    await page.reload();
    await expect(
      page.getByText("Browser Student", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Email confirmed by Supabase Auth", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Edit profile" }).click();
    await page
      .getByLabel("Display name", { exact: true })
      .fill("Updated Browser Student");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(
      page.getByText("Updated Browser Student", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open account menu" }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?next=/);
    expect(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("campuspass.demo.v1") || "null"),
      ),
    ).toEqual(demo);
    await signIn(page, email, password);
    await expect(
      page.getByText("Updated Browser Student", { exact: true }),
    ).toBeVisible();
    const second = await browser.newContext();
    contexts.push(second);
    const otherPage = await second.newPage();
    await signIn(otherPage, email, password);
    await expect(
      otherPage.getByText("Updated Browser Student", { exact: true }),
    ).toBeVisible();
    // A distinct real user cannot read the first student's profile. API suite separately confirms this user's email.
    otherEmail = `phase5-private-${randomUUID()}@example.test`;
    const other = await api.auth.signUp({ email: otherEmail, password });
    expect(other.error).toBeNull();
    const link = await confirmationLink(otherEmail);
    await fetch(link, { redirect: "manual" });
    expect(
      (await api.auth.signInWithPassword({ email: otherEmail, password }))
        .error,
    ).toBeNull();
    expect((await api.from("student_profiles").select("*")).data).toEqual([]);
    await pool.query("delete from auth.users where id=$1", [
      other.data.user!.id,
    ]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await api.auth.dispose();
    // Match test-only addresses even if signup failed before assigning userId.
    await pool.query("delete from auth.users where email=$1 or email=$2", [
      email,
      otherEmail || null,
    ]);
    await pool.end();
  }
});
