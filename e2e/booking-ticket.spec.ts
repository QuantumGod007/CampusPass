import { expect, test, type Page } from "@playwright/test";
import { createSeed } from "../src/data/seed";
import { makeRegistration } from "../src/lib/domain";
import { student } from "../src/tests/fixtures";
import AxeBuilder from "@axe-core/playwright";

async function openPass(page: Page, long = false) {
  const initial = createSeed();
  if (long) {
    initial.events[0].title = "BuildFest" + "CreativeCoding".repeat(5);
    initial.events[0].venue = "Innovation Hub · " + "CampusVenue".repeat(8);
  }
  const fullName = long
    ? "Aarya" +
      "LongStudentName".repeat(5) +
      " Deshmukh " +
      "LongStudentName".repeat(3)
    : student.fullName;
  const { state, registration } = makeRegistration(initial, "buildfest", {
    ...student,
    fullName,
  });
  await page.addInitScript((saved) => {
    localStorage.setItem("campuspass.demo.v1", JSON.stringify(saved));
  }, state);
  await page.goto(`/bookings/${registration.id}`);
  await page
    .locator(".pass-artwork img")
    .evaluate(async (image: HTMLImageElement) => image.decode());
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
}

async function assertPosterAndContent(page: Page) {
  const poster = page.locator(".pass-artwork img");
  await expect(poster).toHaveCSS("object-fit", "contain");
  const geometry = await poster.evaluate((image: HTMLImageElement) => ({
    width: image.getBoundingClientRect().width,
    height: image.getBoundingClientRect().height,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  }));
  expect(geometry.width).toBeGreaterThan(0);
  expect(
    Math.abs(
      geometry.height -
        (geometry.width * geometry.naturalHeight) / geometry.naturalWidth,
    ),
  ).toBeLessThan(1);
  const imageBox = await poster.boundingBox();
  const labelBox = await page.locator(".pass-artwork-label").boundingBox();
  expect(labelBox!.y).toBeGreaterThanOrEqual(imageBox!.y + imageBox!.height);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const overflow = await page.locator(".digital-pass").evaluate((ticket) =>
    Array.from(
      ticket.querySelectorAll(
        "h2, .pass-student > div, .pass-facts p, .pass-id > div",
      ),
    )
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => element.className || element.tagName),
  );
  expect(overflow).toEqual([]);
  const ticket = await page.locator(".digital-pass").boundingBox();
  for (const selector of [
    ".pass-content > h2",
    ".pass-student",
    ".pass-id code",
    ".ticket-bars",
  ]) {
    const box = await page.locator(selector).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(ticket!.x);
    expect(box!.x + box!.width).toBeLessThanOrEqual(
      ticket!.x + ticket!.width + 1,
    );
  }
}

test.use({ timezoneId: "Asia/Kolkata" });
for (const width of [1440, 768, 390, 320]) {
  for (const long of [false, true]) {
    test(`ticket stays intact at ${width}px with ${long ? "long" : "standard"} content`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await openPass(page, long);
      await assertPosterAndContent(page);
      await page.screenshot({
        path: testInfo.outputPath("ticket.png"),
        fullPage: true,
      });
    });
  }
}

test("print ticket preserves the full poster and fits on A4", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 794, height: 1123 });
  await openPass(page, true);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await assertPosterAndContent(page);
  await expect(page.locator(".pass-actions")).toBeHidden();
  await expect(page.locator(".site-header")).toBeHidden();
  const ticket = await page.locator(".digital-pass").boundingBox();
  // A4 height minus the two 15mm page margins, in CSS pixels.
  expect(ticket!.height).toBeLessThan(1009);
  await page.screenshot({
    path: testInfo.outputPath("ticket-print.png"),
    fullPage: true,
  });
  await page.pdf({
    path: testInfo.outputPath("ticket-print.pdf"),
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
  });
});

test("calendar controls and ticket preserve automated accessibility", async ({
  page,
}) => {
  await openPass(page);
  await page.getByRole("button", { name: "More calendar options" }).click();
  await expect(
    page.getByRole("button", { name: /Apple Calendar \/ Outlook/ }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
