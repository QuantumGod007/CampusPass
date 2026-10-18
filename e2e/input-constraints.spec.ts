import { expect, test, type Locator } from "@playwright/test";

async function paste(input: Locator, text: string) {
  await input.focus();
  await input.evaluate((element, value) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", value);
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, text);
}

test("native typing limits, numeric filtering, replacement and deletion work", async ({
  page,
}) => {
  await page.goto("/events/buildfest/register");
  const mobile = page.getByLabel("Mobile number", { exact: true });
  const prn = page.getByLabel("Student PRN", { exact: true });
  await mobile.pressSequentially("98765432101234");
  await expect(mobile).toHaveValue("9876543210");
  await expect(mobile).toHaveAttribute("type", "tel");
  await expect(mobile).toHaveAttribute("inputmode", "numeric");
  await mobile.press("End");
  await mobile.press("Backspace");
  await expect(mobile).toHaveValue("987654321");
  await mobile.press("0");
  await prn.pressSequentially("00ab2026123456789");
  await expect(prn).toHaveValue("002026123456");
  await prn.evaluate((input: HTMLInputElement) =>
    input.setSelectionRange(2, 4),
  );
  await paste(prn, "99");
  await expect(prn).toHaveValue("009926123456");
});

test("formatted pastes are normalized, errors clear, and a valid registration succeeds", async ({
  page,
}) => {
  await page.goto("/events/buildfest/register");
  await page.getByLabel("Full name", { exact: true }).fill("Aarya Deshmukh");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("aarya@example.com");
  const mobile = page.getByLabel("Mobile number", { exact: true });
  const prn = page.getByLabel("Student PRN", { exact: true });
  await mobile.fill("5123456789");
  await prn.fill("00202612345");
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await expect(
    page.getByText(
      "Enter a valid Indian mobile number starting with 6, 7, 8, or 9.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("PRN must contain exactly 12 digits."),
  ).toBeVisible();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Aarya Deshmukh",
  );
  await mobile.selectText();
  await paste(mobile, "+91 (98765) 43210");
  await prn.selectText();
  await paste(prn, "00 2026-123456789");
  await expect(mobile).toHaveValue("9876543210");
  await expect(prn).toHaveValue("002026123456");
  await expect(mobile).toHaveAttribute("aria-invalid", "false");
  await expect(prn).toHaveAttribute("aria-invalid", "false");
  await page
    .getByLabel("Department", { exact: true })
    .selectOption("Computer Science");
  await page
    .getByLabel("Academic year", { exact: true })
    .selectOption("Second year");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm registration" }).click();
  await expect(
    page.getByRole("heading", { name: "You’re on the list." }),
  ).toBeVisible();
  const registration = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("campuspass.demo.v1")!).registrations[0],
  );
  expect(registration.mobile).toBe("9876543210");
  expect(registration.prn).toBe("002026123456");
});
